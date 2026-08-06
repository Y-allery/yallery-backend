import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiExcludeController } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { RateLimit, RateLimitGuard } from 'src/core/guards/rate-limit.guard';
import { PartnerAccountService } from '../application/partner-account.service';
import { PartnerPaymentService } from '../application/partner-payment.service';
import { StripeClient } from '../infrastructure/stripe.client';
import { PartnerApiUsageEntity } from '../entities/partner-api-usage.entity';
import { PartnerBalanceTransactionEntity } from '../entities/partner-balance-transaction.entity';
import { PartnerExceptionFilter } from '../infrastructure/partner-exception.filter';
import {
  PartnerPortalRequest,
  PartnerSessionGuard,
} from '../infrastructure/partner-session.guard';
import {
  CreateOwnKeyDto,
  PartnerChangePasswordDto,
  PartnerSignInDto,
  PartnerSignUpDto,
  RevokeOwnKeyDto,
} from './dto/partner-portal.dto';
import {
  PartnerAutoRechargeDto,
  PartnerTopUpDto,
} from './dto/partner-billing.dto';

/**
 * The customer's own cabinet: sign in, see the balance, mint and revoke keys.
 *
 * Excluded from the partner API reference on purpose — that document describes the
 * machine-to-machine surface a partner integrates against, and mixing account management
 * into it would suggest those calls are part of the integration.
 */
@ApiExcludeController()
@Controller('portal')
@UseFilters(PartnerExceptionFilter)
export class PartnerPortalController {
  constructor(
    private readonly accounts: PartnerAccountService,
    private readonly payments: PartnerPaymentService,
    private readonly stripe: StripeClient,
    @InjectRepository(PartnerApiUsageEntity)
    private readonly usage: Repository<PartnerApiUsageEntity>,
    @InjectRepository(PartnerBalanceTransactionEntity)
    private readonly transactions: Repository<PartnerBalanceTransactionEntity>,
  ) {}

  /**
   * Where Stripe sends the customer back to.
   *
   * Built from the request rather than configured, so the portal works on whichever host it
   * is being served from — and a partner who signed in on dev is not returned to prod.
   */
  private portalUrl(request: PartnerPortalRequest): string {
    const headers = request.headers as Record<string, string>;
    const proto = headers['x-forwarded-proto'] || 'https';
    return `${proto}://${headers.host}/portal`;
  }

  // Both credential routes are rate limited by IP: they are the two places where guessing
  // is the attack, and neither has a partner key to bucket by yet.
  @Post('auth/signup')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 3_600_000, keyPrefix: 'portal-signup' })
  signUp(@Body() dto: PartnerSignUpDto) {
    return this.accounts.signUp(dto);
  }

  @Post('auth/login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 900_000, keyPrefix: 'portal-login' })
  signIn(@Body() dto: PartnerSignInDto) {
    return this.accounts.signIn(dto.email, dto.password);
  }

  @Post('auth/password')
  @UseGuards(PartnerSessionGuard)
  async changePassword(
    @Body() dto: PartnerChangePasswordDto,
    @Req() request: PartnerPortalRequest,
  ) {
    await this.accounts.changePassword(
      request.partnerAccount.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
  }

  @Get('account')
  @UseGuards(PartnerSessionGuard)
  async account(@Req() request: PartnerPortalRequest) {
    const account = request.partnerAccount;
    const keys = await this.accounts.listKeys(account.id);
    const spend = await this.usage
      .createQueryBuilder('u')
      .select('COUNT(*)', 'calls')
      .addSelect('COALESCE(SUM(u.priceUsd), 0)', 'spentUsd')
      .where('u.partnerKeyId IN (:...ids)', {
        ids: keys.length ? keys.map((key) => key.id) : [0],
      })
      .andWhere("u.status = 'succeeded'")
      .getRawOne<{ calls: string; spentUsd: string }>();

    return {
      email: account.email,
      company: account.company,
      balanceUsd: Number(account.balanceUsd),
      totals: {
        calls: Number(spend?.calls ?? 0),
        spentUsd: Number(spend?.spentUsd ?? 0),
      },
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    };
  }

  @Post('keys')
  @UseGuards(PartnerSessionGuard)
  async createKey(
    @Body() dto: CreateOwnKeyDto,
    @Req() request: PartnerPortalRequest,
  ) {
    const { record, plaintext } = await this.accounts.createKey(
      request.partnerAccount.id,
      dto.name ?? 'API key',
    );
    return {
      id: record.id,
      name: record.name,
      key: plaintext,
      note: 'Copy it now — this is the only time it is shown.',
    };
  }

  @Post('keys/revoke')
  @UseGuards(PartnerSessionGuard)
  async revokeKey(
    @Body() dto: RevokeOwnKeyDto,
    @Req() request: PartnerPortalRequest,
  ) {
    await this.accounts.revokeKey(request.partnerAccount.id, dto.id);
    return { id: dto.id, isActive: false };
  }

  @Get('usage')
  @UseGuards(PartnerSessionGuard)
  async usageHistory(
    @Req() request: PartnerPortalRequest,
    @Query('days') days?: string,
  ) {
    const window = Math.min(Math.max(Number(days) || 30, 1), 365);
    const keys = await this.accounts.listKeys(request.partnerAccount.id);
    if (!keys.length) return { windowDays: window, rows: [] };

    const rows = await this.usage
      .createQueryBuilder('u')
      .select('u.model', 'model')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('COALESCE(SUM(u.priceUsd), 0)', 'spentUsd')
      .addSelect('ROUND(AVG(u.executionMs))', 'avgMs')
      .where('u.partnerKeyId IN (:...ids)', { ids: keys.map((key) => key.id) })
      .andWhere("u.status = 'succeeded'")
      .andWhere('u.createdAt >= DATE_SUB(NOW(), INTERVAL :window DAY)', {
        window,
      })
      .groupBy('u.model')
      .orderBy('spentUsd', 'DESC')
      .getRawMany();

    return { windowDays: window, rows };
  }

  @Get('billing')
  @UseGuards(PartnerSessionGuard)
  async billing(@Req() request: PartnerPortalRequest) {
    const account = request.partnerAccount;
    const [configured, minimumTopUpUsd, payments] = await Promise.all([
      this.stripe.isConfigured(),
      this.stripe.minimumTopUpUsd(),
      this.payments.history(account.id),
    ]);

    return {
      cardPaymentAvailable: configured,
      minimumTopUpUsd,
      balanceUsd: Number(account.balanceUsd),
      card: account.paymentMethodId
        ? {
            brand: account.paymentMethodBrand,
            last4: account.paymentMethodLast4,
          }
        : null,
      autoRecharge: {
        enabled: account.autoRechargeEnabled,
        thresholdUsd:
          account.autoRechargeThresholdUsd == null
            ? null
            : Number(account.autoRechargeThresholdUsd),
        amountUsd:
          account.autoRechargeAmountUsd == null
            ? null
            : Number(account.autoRechargeAmountUsd),
        disabledReason: account.autoRechargeDisabledReason,
      },
      payments: payments.map((payment) => ({
        amountUsd: Number(payment.amountUsd),
        status: payment.status,
        kind: payment.kind,
        failureCode: payment.failureCode,
        createdAt: payment.createdAt,
      })),
    };
  }

  @Post('billing/topup')
  @UseGuards(PartnerSessionGuard)
  topUp(@Body() dto: PartnerTopUpDto, @Req() request: PartnerPortalRequest) {
    return this.payments.startTopUp(
      request.partnerAccount,
      dto.amountUsd,
      this.portalUrl(request),
    );
  }

  @Post('billing/card')
  @UseGuards(PartnerSessionGuard)
  addCard(@Req() request: PartnerPortalRequest) {
    return this.payments.startCardSetup(
      request.partnerAccount,
      this.portalUrl(request),
    );
  }

  @Post('billing/card/remove')
  @UseGuards(PartnerSessionGuard)
  async removeCard(@Req() request: PartnerPortalRequest) {
    await this.payments.removeCard(request.partnerAccount);
    return { ok: true };
  }

  @Post('billing/auto-recharge')
  @UseGuards(PartnerSessionGuard)
  async autoRecharge(
    @Body() dto: PartnerAutoRechargeDto,
    @Req() request: PartnerPortalRequest,
  ) {
    await this.payments.setAutoRecharge(request.partnerAccount, dto);
    return { ok: true };
  }

  /**
   * Stripe's callback. No session, no partner key — the signature is the authentication.
   *
   * The body arrives as a Buffer because `main.ts` routes this path around the JSON parser:
   * re-serialising the payload changes the bytes the signature was computed over, and the
   * check then fails for every legitimate call. Answering 200 to something we could not
   * verify would let anyone credit their own balance.
   */
  @Post('billing/webhook')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() request: { body: Buffer; headers: Record<string, string> },
  ) {
    const signature = request.headers['stripe-signature'];
    if (!signature || !Buffer.isBuffer(request.body)) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message: 'Unsigned or already-parsed payload.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const event = await this.stripe.constructEvent(request.body, signature);
    await this.payments.handleEvent(event);
    return { received: true };
  }

  @Get('transactions')
  @UseGuards(PartnerSessionGuard)
  async ledger(@Req() request: PartnerPortalRequest) {
    const rows = await this.transactions.find({
      where: { accountId: request.partnerAccount.id },
      order: { id: 'DESC' },
      take: 100,
    });
    return rows.map((row) => ({
      kind: row.kind,
      amountUsd: Number(row.amountUsd),
      balanceAfterUsd: Number(row.balanceAfterUsd),
      note: row.note,
      createdAt: row.createdAt,
    }));
  }
}
