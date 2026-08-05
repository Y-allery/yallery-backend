import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from '../entities/partner-api-usage.entity';
import { hashPartnerKey } from '../infrastructure/partner-key.guard';
import { PARTNER_MODELS } from '../domain/partner-model.catalog';
import {
  CreatePartnerKeyDto,
  RevokePartnerKeyDto,
} from './dto/admin-partner-key.dto';

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
  ) {}

  @Post('keys')
  @ApiOperation({
    summary: 'Mint a partner API key',
    description:
      'Returns the plaintext key ONCE. Only its hash is stored, so a lost key cannot be ' +
      'recovered — mint a new one and revoke the old.',
  })
  async createKey(@Body() dto: CreatePartnerKeyDto) {
    const plaintext = `ya_${randomBytes(24).toString('hex')}`;
    const record = await this.keys.save(
      this.keys.create({
        name: dto.name,
        keyHash: hashPartnerKey(plaintext),
        keyPrefix: plaintext.slice(0, 11),
        rateLimitPerMinute: dto.rateLimitPerMinute ?? null,
        isActive: true,
      }),
    );
    return {
      id: record.id,
      name: record.name,
      key: plaintext,
      rateLimitPerMinute: record.rateLimitPerMinute,
      note: 'Shown once. Store it now.',
    };
  }

  @Get('keys')
  @ApiOperation({ summary: 'List partner keys (never the secrets)' })
  async listKeys() {
    const records = await this.keys.find({ order: { id: 'DESC' } });
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      isActive: record.isActive,
      rateLimitPerMinute: record.rateLimitPerMinute,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
    }));
  }

  @Post('keys/revoke')
  @ApiOperation({ summary: 'Deactivate a partner key' })
  async revokeKey(@Body() dto: RevokePartnerKeyDto) {
    await this.keys.update({ id: dto.id }, { isActive: false });
    return { id: dto.id, isActive: false };
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Billing summary per key and model',
    description:
      'Revenue, our cost and the resulting margin over the window. Successful calls only — ' +
      'failures are recorded with a zero price and are visible in the `failed` count.',
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
