import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { PartnerBillingService } from '../application/partner-billing.service';
import { PartnerAccountEntity } from '../entities/partner-account.entity';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from '../entities/partner-api-usage.entity';
import { hashPartnerKey } from '../infrastructure/partner-key.guard';
import { PARTNER_MODELS } from '../domain/partner-model.catalog';
import {
  CreatePartnerKeyDto,
  RevokePartnerKeyDto,
  TopUpAccountDto,
} from './dto/admin-partner-key.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Controller('admin/partner-api')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminPartnerApiController {
  constructor(
    @InjectRepository(PartnerApiKeyEntity)
    private readonly keys: Repository<PartnerApiKeyEntity>,
    @InjectRepository(PartnerApiUsageEntity)
    private readonly usage: Repository<PartnerApiUsageEntity>,
    @InjectRepository(PartnerAccountEntity)
    private readonly accounts: Repository<PartnerAccountEntity>,
    private readonly billing: PartnerBillingService,
  ) {}

  @Get('accounts')
  @ApiOperation({
    summary: 'List partner accounts with balances',
    description:
      'Everyone who signed up at /portal, newest first, with what they hold, what they ' +
      'have spent and what it cost us.',
  })
  async listAccounts() {
    const accounts = await this.accounts.find({ order: { id: 'DESC' } });
    const keys = await this.keys.find();
    const spend = await this.usage
      .createQueryBuilder('u')
      .select('u.partnerKeyId', 'partnerKeyId')
      .addSelect('COALESCE(SUM(u.priceUsd), 0)', 'spentUsd')
      .addSelect('COALESCE(SUM(u.costUsd), 0)', 'costUsd')
      .addSelect('COUNT(*)', 'calls')
      .groupBy('u.partnerKeyId')
      .getRawMany<{
        partnerKeyId: number;
        spentUsd: string;
        costUsd: string;
        calls: string;
      }>();

    const byKey = new Map(spend.map((row) => [Number(row.partnerKeyId), row]));
    return accounts.map((account) => {
      const own = keys.filter((key) => key.accountId === account.id);
      const totals = own.reduce(
        (sum, key) => {
          const row = byKey.get(key.id);
          return {
            calls: sum.calls + Number(row?.calls ?? 0),
            spentUsd: sum.spentUsd + Number(row?.spentUsd ?? 0),
            costUsd: sum.costUsd + Number(row?.costUsd ?? 0),
          };
        },
        { calls: 0, spentUsd: 0, costUsd: 0 },
      );
      return {
        id: account.id,
        email: account.email,
        company: account.company,
        balanceUsd: Number(account.balanceUsd),
        isActive: account.isActive,
        activeKeys: own.filter((key) => key.isActive).length,
        calls: totals.calls,
        spentUsd: +totals.spentUsd.toFixed(5),
        costUsd: +totals.costUsd.toFixed(5),
        marginUsd: +(totals.spentUsd - totals.costUsd).toFixed(5),
        lastLoginAt: account.lastLoginAt,
        createdAt: account.createdAt,
      };
    });
  }

  @Post('accounts/topup')
  @ApiOperation({
    summary: 'Credit a partner account',
    description:
      'Adds USD to the balance and writes a ledger row. Until a payment provider is wired ' +
      'up this is the only way money enters an account. A negative amount is recorded as ' +
      'an adjustment.',
  })
  async topUp(
    @Body() dto: TopUpAccountDto,
    @Req() request: { user?: { id: number } },
  ) {
    const balanceUsd = await this.billing.topUp(
      dto.accountId,
      dto.amountUsd,
      dto.note ?? null,
      request.user?.id ?? null,
    );
    return { accountId: dto.accountId, balanceUsd };
  }

  @Post('keys')
  @ApiOperation({
    summary: 'Mint an internal API key',
    description:
      'A key with no account, and therefore no balance to spend — for us, not for ' +
      'customers. Customers mint their own at /portal against their own balance.\n\n' +
      'Pass `accountId` to attach the key to a customer instead.\n\n' +
      'Returns the plaintext ONCE; only its hash is stored, so a lost key cannot be ' +
      'recovered — mint a new one and revoke the old.',
  })
  async createKey(@Body() dto: CreatePartnerKeyDto) {
    const plaintext = `ya_${randomBytes(24).toString('hex')}`;
    const record = await this.keys.save(
      this.keys.create({
        name: dto.name,
        accountId: dto.accountId ?? null,
        keyHash: hashPartnerKey(plaintext),
        keyPrefix: plaintext.slice(0, 11),
        rateLimitPerMinute: dto.rateLimitPerMinute ?? null,
        expiresAt: dto.expiresInDays
          ? new Date(Date.now() + dto.expiresInDays * DAY_MS)
          : null,
        isActive: true,
      }),
    );
    return {
      id: record.id,
      name: record.name,
      accountId: record.accountId,
      key: plaintext,
      rateLimitPerMinute: record.rateLimitPerMinute,
      expiresAt: record.expiresAt,
      console: 'https://yallery-api-prod.org/portal',
      docs: 'https://yallery-api-prod.org/v1/docs',
      playground: 'https://yallery-api-prod.org/v1/playground',
      note: 'Shown once. Store it now.',
    };
  }

  @Get('keys')
  @ApiOperation({ summary: 'List every key (never the secrets)' })
  async listKeys() {
    const records = await this.keys.find({ order: { id: 'DESC' } });
    const now = Date.now();
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      accountId: record.accountId,
      keyPrefix: record.keyPrefix,
      isActive: record.isActive,
      expiresAt: record.expiresAt,
      expired: Boolean(record.expiresAt && record.expiresAt.getTime() <= now),
      rateLimitPerMinute: record.rateLimitPerMinute,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
    }));
  }

  @Post('keys/revoke')
  @ApiOperation({ summary: 'Deactivate a key' })
  async revokeKey(@Body() dto: RevokePartnerKeyDto) {
    const result = await this.keys.update({ id: dto.id }, { isActive: false });
    return { id: dto.id, isActive: false, found: Boolean(result.affected) };
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Billing summary per key and model',
    description:
      'Revenue, our cost and the margin over the window. `pending` counts calls still ' +
      'running; `failed` ones were refunded to the partner but still cost us, which is ' +
      'why cost is summed separately from revenue.',
  })
  async usageSummary(@Query('days') days?: string) {
    const window = Math.min(Math.max(Number(days) || 30, 1), 365);
    const rows = await this.usage
      .createQueryBuilder('u')
      .select('u.partnerKeyId', 'partnerKeyId')
      .addSelect('u.model', 'model')
      .addSelect('COUNT(*)', 'calls')
      .addSelect(
        "SUM(CASE WHEN u.status = 'failed' THEN 1 ELSE 0 END)",
        'failed',
      )
      .addSelect(
        "SUM(CASE WHEN u.status = 'pending' THEN 1 ELSE 0 END)",
        'pending',
      )
      .addSelect('SUM(u.priceUsd)', 'revenueUsd')
      .addSelect('SUM(u.costUsd)', 'costUsd')
      .where('u.createdAt >= DATE_SUB(NOW(), INTERVAL :window DAY)', { window })
      .groupBy('u.partnerKeyId')
      .addGroupBy('u.model')
      .orderBy('revenueUsd', 'DESC')
      .getRawMany();

    const totals = rows.reduce(
      (accumulator, row) => ({
        revenueUsd: accumulator.revenueUsd + Number(row.revenueUsd ?? 0),
        costUsd: accumulator.costUsd + Number(row.costUsd ?? 0),
        calls: accumulator.calls + Number(row.calls ?? 0),
      }),
      { revenueUsd: 0, costUsd: 0, calls: 0 },
    );

    return {
      windowDays: window,
      totals: {
        ...totals,
        marginUsd: +(totals.revenueUsd - totals.costUsd).toFixed(5),
      },
      rows,
    };
  }

  @Get('models')
  @ApiOperation({
    summary: 'Catalog with the internal columns',
    description:
      'The same models the partner sees, plus which backend runs each one and what it ' +
      'costs us — neither of which is ever published.',
  })
  listModels() {
    return PARTNER_MODELS.map((model) => ({
      ...model,
      marginUsd: +(model.priceUsd - model.costUsd).toFixed(5),
      marginPct: Math.round((1 - model.costUsd / model.priceUsd) * 100),
    }));
  }
}
