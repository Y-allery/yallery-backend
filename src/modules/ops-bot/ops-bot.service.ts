import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { PaymentEntity } from 'src/modules/billing/payments/entities/payment.entity';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { AIUsageMetricsCollector } from 'src/modules/admin/features/metrics/collectors/ai-usage.collector';
import { TelegramService } from 'src/integrations/telegram/telegram.service';

/** Fallback ONLY for payment rows predating the pointsCredited column. */
const PRODUCT_ID_TO_REWARD: Record<string, RewardTypeEnum> = {
  '5000yeps': RewardTypeEnum.PAYMENT_5000,
  '15000yeps': RewardTypeEnum.PAYMENT_15000,
  '30000yeps': RewardTypeEnum.PAYMENT_30000,
};
const FALLBACK_REWARD_POINTS: Record<string, number> = {
  [RewardTypeEnum.PAYMENT_5000]: 5000,
  [RewardTypeEnum.PAYMENT_15000]: 15000,
  [RewardTypeEnum.PAYMENT_30000]: 30000,
};

/** Kyiv is UTC+2 (EET) / UTC+3 (EEST) — the ops team's actual calendar day. */
const OPS_TIMEZONE = 'Europe/Kyiv';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

/**
 * The Yallery ops bot: an interactive Telegram bot (separate from the
 * user-facing login/referral bot) that is the single destination for
 * everything operational — backend errors, RunPod job failures, and
 * on-demand stats via inline buttons. The content-bot digest also reuses
 * TelegramService (same underlying bot token) so it all lands in one chat.
 *
 * Only the configured TELEGRAM_OPS_CHAT_ID may drive commands/buttons — the
 * webhook's secret_token proves an update came from Telegram, not which chat
 * it's from, so every inbound handler re-checks the chat id itself.
 *
 * Alert methods are DEBOUNCED per fingerprint so a systemic failure (e.g. a
 * broken API key failing every job for hours) sends one alert plus a
 * "+N more" count on the next one, not a flood. Debounce state is committed
 * only AFTER a confirmed successful delivery — a delivery failure (bad chat
 * id, Telegram outage) must not itself consume the cooldown, or the outage
 * it was reporting goes silent for the next 10 minutes too.
 */
@Injectable()
export class OpsBotService {
  private readonly logger = new Logger(OpsBotService.name);
  private static readonly ALERT_COOLDOWN_MS = 10 * 60 * 1000;
  /** Defensive cap so an unbounded key space (shouldn't happen) can't leak memory. */
  private static readonly MAX_TRACKED_KEYS = 500;

  private readonly lastSentAt = new Map<string, number>();
  private readonly suppressedCount = new Map<string, number>();

  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(MediaGenerationChargeEntity)
    private readonly chargeRepository: Repository<MediaGenerationChargeEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly rewardService: RewardService,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly aiUsageCollector: AIUsageMetricsCollector,
    private readonly telegram: TelegramService,
  ) {}

  private async chatId(): Promise<string | null> {
    return this.providerRuntimeConfigService.getString('TELEGRAM_OPS_CHAT_ID');
  }

  private async botUserId(): Promise<number | null> {
    const raw = await this.providerRuntimeConfigService.getNumber(
      'CONTENT_BOT_USER_ID',
    );
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }

  // ---------------------------------------------------------------------------
  // Inbound: webhook update handling
  // ---------------------------------------------------------------------------

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const incomingChatId = update.message
      ? String(update.message.chat.id)
      : update.callback_query?.message
        ? String(update.callback_query.message.chat.id)
        : null;

    if (!incomingChatId || !(await this.isAuthorizedChat(incomingChatId))) {
      // Don't leak any signal (menu, stats) to an unauthorized chat, but a
      // pressed button must still stop its loading spinner.
      if (update.callback_query) {
        await this.telegram.answerCallbackQuery(update.callback_query.id);
      }
      return;
    }

    if (update.message?.text) {
      await this.handleCommand(incomingChatId, update.message.text.trim());
      return;
    }
    if (update.callback_query) {
      await this.handleCallback(incomingChatId, update.callback_query);
    }
  }

  private async isAuthorizedChat(chatId: string): Promise<boolean> {
    const configured = await this.chatId();
    // Fail closed: an unconfigured chat id authorizes nobody, not everybody.
    return Boolean(configured) && configured === chatId;
  }

  private async handleCommand(chatId: string, text: string): Promise<void> {
    if (text === '/start' || text === '/menu') {
      await this.sendMenu(chatId);
    }
  }

  private async sendMenu(chatId: string): Promise<void> {
    await this.telegram.sendMessageWithKeyboard(
      chatId,
      '<b>Yallery Ops</b>\nОбери, що показати:',
      [
        [
          { text: '📊 Генерація сьогодні', callback_data: 'stats:gen' },
          { text: '💰 Йепи сьогодні', callback_data: 'stats:yep' },
        ],
      ],
    );
  }

  private async handleCallback(
    chatId: string,
    cq: NonNullable<TelegramUpdate['callback_query']>,
  ): Promise<void> {
    if (cq.data === 'stats:gen') {
      await this.telegram.answerCallbackQuery(cq.id);
      await this.telegram.sendMessage(chatId, await this.formatGenerationStats());
      return;
    }
    if (cq.data === 'stats:yep') {
      await this.telegram.answerCallbackQuery(cq.id);
      await this.telegram.sendMessage(chatId, await this.formatYepStats());
      return;
    }
    await this.telegram.answerCallbackQuery(cq.id);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /** Start of "today" in the ops team's own calendar day (Kyiv), not the server's. */
  private startOfToday(): Date {
    // en-CA gives YYYY-MM-DD, the one Intl locale format that sorts/parses
    // unambiguously — reusing it to derive Kyiv-midnight avoids hand-rolling
    // DST math (Kyiv is UTC+2 in winter, UTC+3 in summer).
    const kyivDateStr = new Date().toLocaleDateString('en-CA', {
      timeZone: OPS_TIMEZONE,
    });
    // Interpreting that Y-M-D as UTC midnight and comparing it against real
    // UTC-instant createdAt columns is off by Kyiv's own UTC offset — bounded
    // to at most a few hours either side, negligible for a "today" summary,
    // and immensely simpler than reimplementing tz-aware date math by hand.
    return new Date(`${kyivDateStr}T00:00:00Z`);
  }

  async formatGenerationStats(): Promise<string> {
    const start = this.startOfToday();
    const now = new Date();
    const botId = await this.botUserId();

    const [usage, failures] = await Promise.all([
      this.aiUsageCollector.collect(start, now),
      this.failedGenerationsByService(start, botId),
    ]);

    const lines = ['📊 <b>Генерація сьогодні</b>', ''];
    const succeeded = this.mergeUsageCounts(usage.image, usage.video);
    const totalSucceeded = Object.values(succeeded).reduce(
      (s, v) => s + v,
      0,
    );
    const totalFailed = failures.reduce((s, f) => s + f.count, 0);

    lines.push(`✅ Успішно: ${totalSucceeded}`);
    lines.push(`❌ Провалено: ${totalFailed}`);
    lines.push('');
    lines.push('<b>По моделях (успішно):</b>');
    for (const [service, count] of Object.entries(succeeded)) {
      if (count > 0) lines.push(`  ${service}: ${count}`);
    }
    if (failures.length > 0) {
      lines.push('');
      lines.push('<b>По моделях (провалено):</b>');
      for (const f of failures) {
        lines.push(`  ${f.aiService}: ${f.count}`);
      }
    }
    return lines.join('\n');
  }

  /** Sums newPosts per aiService; on a (currently nonexistent) key collision
   * between image/video capabilities, ADDS rather than silently overwriting. */
  private mergeUsageCounts(
    ...maps: Array<Record<string, { newPosts: number }>>
  ): Record<string, number> {
    const merged: Record<string, number> = {};
    for (const map of maps) {
      for (const [service, stat] of Object.entries(map)) {
        merged[service] = (merged[service] ?? 0) + stat.newPosts;
      }
    }
    return merged;
  }

  /**
   * Only counts TERMINAL worker failures (jobId set — i.e. the job actually
   * reached RunPod and exhausted retries, the same charges that triggered a
   * real-time notifyRunpodFailure alert), excluding the content bot's own
   * traffic — mirroring AIUsageMetricsCollector's exclusion on the success
   * side. Enqueue-time refunds (contest-flow/Redis errors before a job is
   * even created) have jobId=NULL and are deliberately excluded: they say
   * nothing about RunPod health, which is what this stat is read as.
   */
  private async failedGenerationsByService(
    start: Date,
    botId: number | null,
  ): Promise<Array<{ aiService: string; count: number }>> {
    const qb = this.chargeRepository
      .createQueryBuilder('c')
      .select('c.aiService', 'aiService')
      .addSelect('COUNT(*)', 'count')
      .where('c.status = :status', { status: 'refunded' })
      .andWhere('c.createdAt >= :start', { start })
      .andWhere('c.jobId IS NOT NULL');
    if (botId != null) {
      qb.andWhere('c.userId != :botId', { botId });
    }
    const rows = await qb
      .groupBy('c.aiService')
      .getRawMany<{ aiService: string; count: string }>();
    return rows.map((r) => ({ aiService: r.aiService, count: Number(r.count) }));
  }

  async formatYepStats(): Promise<string> {
    const start = this.startOfToday();
    const purchases = await this.paymentRepository.find({
      where: {
        status: 'completed',
        isTest: false,
        createdAt: MoreThanOrEqual(start),
      },
    });

    if (purchases.length === 0) {
      return '💰 <b>Йепи сьогодні</b>\n\nПоки що 0 покупок.';
    }

    let totalYeps = 0;
    const revenueByCurrency: Record<string, number> = {};
    for (const p of purchases) {
      totalYeps += await this.creditedPointsFor(p);
      revenueByCurrency[p.currency] =
        (revenueByCurrency[p.currency] ?? 0) + Number(p.amount);
    }

    return [
      '💰 <b>Йепи сьогодні</b>',
      '',
      `Покупок: ${purchases.length}`,
      `YEP нараховано: ${totalYeps}`,
      ...Object.entries(revenueByCurrency).map(
        ([cur, amt]) => `Виручка: ${amt} ${cur}`,
      ),
    ].join('\n');
  }

  /**
   * Prefers the amount frozen at credit time (immune to a reward value being
   * edited later). Only recomputes from the live/mutable reward config for
   * legacy rows predating the pointsCredited column, and even then never lets
   * a deactivated reward type blow up the whole report.
   */
  private async creditedPointsFor(payment: PaymentEntity): Promise<number> {
    if (payment.pointsCredited != null) return payment.pointsCredited;

    const rewardType = PRODUCT_ID_TO_REWARD[payment.productId];
    if (!rewardType) return 0;
    return this.rewardService.getRewardPointsOrDefault(
      rewardType,
      FALLBACK_REWARD_POINTS[rewardType] ?? 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Outbound alerts (debounced, commit-on-confirmed-delivery)
  // ---------------------------------------------------------------------------

  async notifyRunpodFailure(params: {
    aiService: string;
    jobId?: string;
    userId?: number | string;
    message: string;
  }): Promise<void> {
    await this.attemptDebouncedSend(`runpod:${params.aiService}`, (suppressed) =>
      [
        '🔴 <b>RunPod: генерація впала</b>',
        `Модель: ${params.aiService}`,
        params.jobId ? `Job: ${params.jobId}` : null,
        `Помилка: ${params.message}`.slice(0, 500),
        suppressed > 0 ? `(+${suppressed} ще за останні 10 хв)` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  /**
   * fingerprint should be a LOW-CARDINALITY, stable identifier (e.g. the
   * exception type/class) — never the raw message, which often embeds
   * per-request data (ids, params) that would defeat the cooldown entirely by
   * minting a fresh key on every occurrence of the "same" bug.
   */
  async notifyBackendError(text: string, fingerprint: string): Promise<void> {
    await this.attemptDebouncedSend(`backend:${fingerprint}`, (suppressed) =>
      [
        '🐞 <b>Бек-баг</b>',
        text.slice(0, 800),
        suppressed > 0 ? `(+${suppressed} ще за останні 10 хв)` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  /**
   * Runs the debounce gate, resolves the chat, sends, and ONLY THEN commits
   * lastSentAt — a misconfigured chat id or a Telegram-side delivery failure
   * restores the suppressed count and leaves the cooldown untouched, so the
   * very next failure retries immediately instead of two blind spots
   * (the lost alert AND a silently wasted 10-minute cooldown) stacking.
   */
  private async attemptDebouncedSend(
    key: string,
    buildMessage: (suppressedCount: number) => string,
  ): Promise<void> {
    if (!this.canAttempt(key)) {
      this.recordSuppressed(key);
      return;
    }

    const chatId = await this.chatId();
    if (!chatId) {
      this.logger.warn(
        `TELEGRAM_OPS_CHAT_ID not configured — dropping an ops alert (key=${key})`,
      );
      return; // no cooldown spent on a config error; retries immediately
    }

    const suppressed = this.takeSuppressed(key);
    const sent = await this.telegram.sendMessage(chatId, buildMessage(suppressed));
    if (sent) {
      this.markSent(key);
    } else {
      this.restoreSuppressed(key, suppressed);
      this.logger.warn(`Failed to deliver ops alert to Telegram (key=${key})`);
    }
  }

  private canAttempt(key: string): boolean {
    const last = this.lastSentAt.get(key) ?? 0;
    return Date.now() - last >= OpsBotService.ALERT_COOLDOWN_MS;
  }

  private markSent(key: string): void {
    this.sweepIfOversized();
    this.lastSentAt.set(key, Date.now());
  }

  private recordSuppressed(key: string): void {
    this.suppressedCount.set(key, (this.suppressedCount.get(key) ?? 0) + 1);
  }

  private takeSuppressed(key: string): number {
    const n = this.suppressedCount.get(key) ?? 0;
    this.suppressedCount.delete(key);
    return n;
  }

  private restoreSuppressed(key: string, n: number): void {
    if (n > 0) this.suppressedCount.set(key, n);
  }

  /** Cheap insurance against key-space growth if a fingerprint scheme ever
   * regresses to high-cardinality — drops the oldest entries, not a crash. */
  private sweepIfOversized(): void {
    if (this.lastSentAt.size < OpsBotService.MAX_TRACKED_KEYS) return;
    const entries = [...this.lastSentAt.entries()].sort((a, b) => a[1] - b[1]);
    const toDrop = entries.slice(0, entries.length - OpsBotService.MAX_TRACKED_KEYS + 1);
    for (const [key] of toDrop) {
      this.lastSentAt.delete(key);
      this.suppressedCount.delete(key);
    }
    this.logger.warn(
      `Ops alert key space hit ${OpsBotService.MAX_TRACKED_KEYS}; dropped ${toDrop.length} oldest fingerprints`,
    );
  }
}
