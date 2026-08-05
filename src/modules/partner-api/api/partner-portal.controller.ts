import {
  Body,
  Controller,
  Get,
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
    @InjectRepository(PartnerApiUsageEntity)
    private readonly usage: Repository<PartnerApiUsageEntity>,
    @InjectRepository(PartnerBalanceTransactionEntity)
    private readonly transactions: Repository<PartnerBalanceTransactionEntity>,
  ) {}

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
