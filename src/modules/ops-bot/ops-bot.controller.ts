import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { TelegramService } from 'src/integrations/telegram/telegram.service';
import { OpsBotService } from './ops-bot.service';

/**
 * Constant-time secret comparison. Plain `!==` short-circuits at the first
 * differing byte, leaking a (weak) timing signal about how much of the
 * secret an attacker has guessed right; this is the standard mitigation for
 * comparing a bearer-style secret against untrusted input.
 */
function secretsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  // timingSafeEqual throws on length mismatch — that itself isn't
  // exploitable at the granularity of an HTTP request over the internet, and
  // returning false here is the correct outcome either way.
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('ops-bot')
@ApiTags('Ops')
export class OpsBotController {
  constructor(
    private readonly opsBot: OpsBotService,
    private readonly telegram: TelegramService,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly configService: ConfigService,
  ) {}

  /** Telegram calls this. Verified via the secret_token header, not JWT. */
  @Post('webhook')
  async webhook(
    @Body() update: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
  ) {
    const expected = await this.providerRuntimeConfigService.getString(
      'TELEGRAM_OPS_WEBHOOK_SECRET',
    );
    if (!expected || !secretHeader || !secretsMatch(expected, secretHeader)) {
      throw new ForbiddenException('Invalid webhook secret');
    }
    await this.opsBot.handleUpdate(update as any);
    return { ok: true };
  }

  /**
   * Fire-and-forget target for in-process alert sources (the Sentry
   * beforeSend hook, which runs before Nest's DI graph exists and so can't
   * call OpsBotService directly). Gated by a shared secret ONLY — a same-host
   * nginx reverse proxy makes req.socket.remoteAddress equal 127.0.0.1 for
   * EVERY request it forwards, external or not, so a loopback-address check
   * here would be no check at all.
   */
  @Post('internal-notify')
  async internalNotify(
    @Headers('x-ops-internal-secret') secretHeader: string | undefined,
    @Body() body: { text?: string; fingerprint?: string },
  ) {
    const expected = this.configService.get<string>('OPS_INTERNAL_NOTIFY_SECRET');
    if (!expected || !secretHeader || !secretsMatch(expected, secretHeader)) {
      throw new ForbiddenException('Invalid internal secret');
    }
    if (!body.text) {
      throw new BadRequestException('text is required');
    }
    await this.opsBot.notifyBackendError(
      body.text,
      body.fingerprint || 'unknown',
    );
    return { ok: true };
  }

  @Post('setup-webhook')
  @ApiOperation({
    summary: 'Register the ops bot webhook with Telegram (admin only)',
  })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(RoleEnum.ADMIN)
  async setupWebhook(@Body() body: { baseUrl: string }) {
    if (!body.baseUrl) {
      throw new BadRequestException('baseUrl is required');
    }
    let secret = await this.providerRuntimeConfigService.getString(
      'TELEGRAM_OPS_WEBHOOK_SECRET',
    );
    if (!secret) {
      secret = randomBytes(24).toString('hex');
      await this.providerRuntimeConfigService.updateSetting(
        'TELEGRAM_OPS_WEBHOOK_SECRET',
        { value: secret },
        null,
      );
    }
    const url = `${body.baseUrl.replace(/\/$/, '')}/ops-bot/webhook`;
    const ok = await this.telegram.setWebhook(url, secret);
    return { ok, url };
  }
}
