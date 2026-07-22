import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
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

interface TelegramFrom {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: TelegramFrom;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
    from?: TelegramFrom;
  };
}

/**
 * The Yallery ops bot: an interactive Telegram bot (separate from the
 * user-facing login/referral bot) that is the single destination for
 * everything operational — backend errors, RunPod job failures, and
 * on-demand stats via inline buttons. The content-bot digest also reuses
 * TelegramService (same underlying bot token) so it all lands in one chat.
 *
 * Only chats in TELEGRAM_OPS_AUTHORIZED_CHAT_IDS (comma-separated; falls back
 * to the single TELEGRAM_OPS_CHAT_ID if unset) may drive commands/buttons —
 * the webhook's secret_token proves an update came from Telegram, not which
 * chat it's from, so every inbound handler re-checks the chat id itself. This
 * is deliberately a SEPARATE list from TELEGRAM_OPS_CHAT_ID, which is where
 * outbound alerts (backend errors, RunPod failures) are sent — someone can be
 * allowed to look up stats without also being paged on every prod incident.
 * An unauthorized attempt is logged (chat id + Telegram username, never
 * replied to) so a new person to authorize can be identified from the logs.
 *
 * Alert methods are DEBOUNCED per fingerprint so a systemic failure (e.g. a
 * broken API key failing every job for hours) sends one alert plus a
 * "+N more" count on the next one, not a flood. Debounce state is committed
 * only AFTER a confirmed successful delivery — a delivery failure (bad chat
 * id, Telegram outage) must not itself consume the cooldown, or the outage
 * it was reporting goes silent for the next 10 minutes too.
 *
 * Self-service authorization: an unauthorized /start is recorded as a
 * "pending request" (in-memory, chat id + Telegram username) and pings the
 * ops chat with a ready-to-paste `/authorize` command — so a new person can
 * be granted access from inside the chat itself, without ever asking an
 * engineer to touch the DB. `/pending` lists open requests, `/authorize <id
 * or @username>` grants, `/revoke <id>` removes (refuses to drop the last
 * remaining chat or the caller's own access, so nobody can lock themselves
 * out via the bot).
 */
@Injectable()
export class OpsBotService {
  private readonly logger = new Logger(OpsBotService.name);
  private static readonly ALERT_COOLDOWN_MS = 10 * 60 * 1000;
  /** Defensive cap so an unbounded key space (shouldn't happen) can't leak memory. */
  private static readonly MAX_TRACKED_KEYS = 500;
  private static readonly MAX_PENDING_REQUESTS = 200;
  private static readonly PENDING_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

  private readonly lastSentAt = new Map<string, number>();
  private readonly suppressedCount = new Map<string, number>();
  private readonly pendingAccessRequests = new Map<
    string,
    { username?: string; firstName?: string; requestedAt: number }
  >();

  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(MediaGenerationChargeEntity)
    private readonly chargeRepository: Repository<MediaGenerationChargeEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAiSettingsRepository: Repository<MediaAISettingsEntity>,
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
    const from = update.message?.from ?? update.callback_query?.from;

    if (!incomingChatId || !(await this.isAuthorizedChat(incomingChatId))) {
      this.logger.warn(
        `Unauthorized ops-bot chat attempt: chatId=${incomingChatId} ` +
          `from=@${from?.username ?? '?'} (${from?.first_name ?? 'unknown'}, id=${from?.id ?? '?'}) — ` +
          `add ${incomingChatId} to TELEGRAM_OPS_AUTHORIZED_CHAT_IDS to allow`,
      );
      if (incomingChatId) {
        this.recordPendingAccessRequest(incomingChatId, from);
        await this.notifyAccessRequest(incomingChatId, from);
      }
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

  private async authorizedChatIds(): Promise<Set<string>> {
    const list = await this.providerRuntimeConfigService.getString(
      'TELEGRAM_OPS_AUTHORIZED_CHAT_IDS',
    );
    const primary = await this.chatId();
    const ids = (list ?? primary ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return new Set(ids);
  }

  private async isAuthorizedChat(chatId: string): Promise<boolean> {
    const authorized = await this.authorizedChatIds();
    // Fail closed: an empty list authorizes nobody, not everybody.
    return authorized.has(chatId);
  }

  private recordPendingAccessRequest(chatId: string, from?: TelegramFrom): void {
    this.sweepPendingIfOversized();
    this.pendingAccessRequests.set(chatId, {
      username: from?.username,
      firstName: from?.first_name,
      requestedAt: Date.now(),
    });
  }

  /** Cheap insurance against key-space growth if this ever gets spammed. */
  private sweepPendingIfOversized(): void {
    if (this.pendingAccessRequests.size < OpsBotService.MAX_PENDING_REQUESTS) {
      return;
    }
    const entries = [...this.pendingAccessRequests.entries()].sort(
      (a, b) => a[1].requestedAt - b[1].requestedAt,
    );
    const toDrop = entries.slice(
      0,
      entries.length - OpsBotService.MAX_PENDING_REQUESTS + 1,
    );
    for (const [id] of toDrop) this.pendingAccessRequests.delete(id);
  }

  private expireStalePendingRequests(): void {
    const cutoff = Date.now() - OpsBotService.PENDING_REQUEST_TTL_MS;
    for (const [id, req] of this.pendingAccessRequests) {
      if (req.requestedAt < cutoff) this.pendingAccessRequests.delete(id);
    }
  }

  /**
   * Pings the ops chat with a ready-to-paste `/authorize` command. Reuses the
   * same debounce machinery as the alert methods (keyed per requesting chat)
   * so someone mashing /start doesn't flood the ops chat with duplicates.
   */
  private async notifyAccessRequest(
    chatId: string,
    from?: TelegramFrom,
  ): Promise<void> {
    const who = from?.username
      ? `@${from.username}`
      : (from?.first_name ?? 'unknown');
    await this.attemptDebouncedSend(`access-request:${chatId}`, (suppressed) =>
      [
        '🔐 <b>Запит на доступ до ops-бота</b>',
        `Від: ${who}`,
        `chat_id: <code>${chatId}</code>`,
        '',
        `Дозволити: <code>/authorize ${from?.username ? '@' + from.username : chatId}</code>`,
        suppressed > 0
          ? `(+${suppressed} повторних спроб за останні 10 хв)`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private resolveTargetChatId(arg: string): string | null {
    if (/^-?\d+$/.test(arg)) return arg;
    if (arg.startsWith('@')) {
      const username = arg.slice(1).toLowerCase();
      for (const [id, req] of this.pendingAccessRequests) {
        if (req.username?.toLowerCase() === username) return id;
      }
    }
    return null;
  }

  private async handleCommand(chatId: string, text: string): Promise<void> {
    if (text === '/start' || text === '/menu') {
      await this.sendMenu(chatId);
      return;
    }
    if (text === '/pending') {
      await this.sendPendingRequests(chatId);
      return;
    }
    if (text === '/authorize' || text.startsWith('/authorize ')) {
      await this.handleAuthorizeCommand(chatId, text);
      return;
    }
    if (text === '/revoke' || text.startsWith('/revoke ')) {
      await this.handleRevokeCommand(chatId, text);
      return;
    }
  }

  private async sendPendingRequests(chatId: string): Promise<void> {
    this.expireStalePendingRequests();
    if (this.pendingAccessRequests.size === 0) {
      await this.telegram.sendMessage(
        chatId,
        'Немає нещодавніх запитів на доступ.',
      );
      return;
    }

    const lines = ['<b>Очікують авторизації:</b>', ''];
    for (const [id, req] of this.pendingAccessRequests) {
      const who = req.username
        ? `@${req.username}`
        : (req.firstName ?? 'unknown');
      const minsAgo = Math.round((Date.now() - req.requestedAt) / 60000);
      lines.push(`• ${who} — id <code>${id}</code> — ${minsAgo} хв тому`);
    }
    lines.push('', 'Дозволити: /authorize <id або @username>');
    await this.telegram.sendMessage(chatId, lines.join('\n'));
  }

  private async handleAuthorizeCommand(
    chatId: string,
    text: string,
  ): Promise<void> {
    const arg = text.split(/\s+/)[1];
    if (!arg) {
      await this.telegram.sendMessage(
        chatId,
        'Формат: /authorize <chat_id> або /authorize @username\n' +
          '(@username працює лише якщо ця людина вже писала /start — перевір /pending)',
      );
      return;
    }

    const resolved = this.resolveTargetChatId(arg);
    if (!resolved) {
      await this.telegram.sendMessage(
        chatId,
        `Не знайшов недавній запит від ${arg}. Хай спочатку напише /start боту, тоді перевір /pending.`,
      );
      return;
    }

    const current = await this.authorizedChatIds();
    if (current.has(resolved)) {
      await this.telegram.sendMessage(chatId, `${resolved} вже авторизований.`);
      return;
    }

    current.add(resolved);
    await this.providerRuntimeConfigService.updateSetting(
      'TELEGRAM_OPS_AUTHORIZED_CHAT_IDS',
      { value: [...current].join(',') },
    );
    this.pendingAccessRequests.delete(resolved);

    await this.telegram.sendMessage(
      chatId,
      `✅ Авторизовано ${resolved}.\nАвторизовані чати: ${[...current].join(', ')}`,
    );
    // Best-effort welcome ping — the new chat may not exist or may have
    // blocked the bot; that must never fail the authorize command itself.
    await this.telegram.sendMessage(
      resolved,
      '✅ Тобі надали доступ до Yallery Ops. Напиши /start.',
    );
  }

  private async handleRevokeCommand(chatId: string, text: string): Promise<void> {
    const arg = text.split(/\s+/)[1];
    if (!arg || !/^-?\d+$/.test(arg)) {
      await this.telegram.sendMessage(chatId, 'Формат: /revoke <chat_id>');
      return;
    }
    if (arg === chatId) {
      await this.telegram.sendMessage(
        chatId,
        'Не можу відкликати власний доступ через бота — онови ' +
          'TELEGRAM_OPS_AUTHORIZED_CHAT_IDS вручну, якщо це справді потрібно.',
      );
      return;
    }

    const current = await this.authorizedChatIds();
    if (!current.has(arg)) {
      await this.telegram.sendMessage(chatId, `${arg} і так не авторизований.`);
      return;
    }

    current.delete(arg);
    if (current.size === 0) {
      await this.telegram.sendMessage(
        chatId,
        'Не можу видалити останній авторизований чат — це заблокує доступ усім.',
      );
      return;
    }

    await this.providerRuntimeConfigService.updateSetting(
      'TELEGRAM_OPS_AUTHORIZED_CHAT_IDS',
      { value: [...current].join(',') },
    );
    await this.telegram.sendMessage(
      chatId,
      `Відкликано доступ у ${arg}.\nАвторизовані чати: ${[...current].join(', ')}`,
    );
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

    const displayNames = await this.aiServiceDisplayNames();
    const lines = ['📊 <b>Генерація сьогодні</b>', ''];
    const succeeded = this.mergeUsageCounts(usage.image, usage.video);
    const succeededByName = this.relabelAndMerge(succeeded, displayNames);
    const failedByName = this.relabelAndMerge(
      Object.fromEntries(failures.map((f) => [f.aiService, f.count])),
      displayNames,
    );
    const totalSucceeded = Object.values(succeeded).reduce(
      (s, v) => s + v,
      0,
    );
    const totalFailed = failures.reduce((s, f) => s + f.count, 0);

    lines.push(`✅ Успішно: ${totalSucceeded}`);
    lines.push(`❌ Провалено: ${totalFailed}`);
    lines.push('');
    lines.push('<b>По моделях (успішно):</b>');
    for (const [label, count] of Object.entries(succeededByName)) {
      if (count > 0) lines.push(`  ${label}: ${count}`);
    }
    if (failures.length > 0) {
      lines.push('');
      lines.push('<b>По моделях (провалено):</b>');
      for (const [label, count] of Object.entries(failedByName)) {
        lines.push(`  ${label}: ${count}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * aiService -> media_ai_settings.name, so ops stats read as "YEngine",
   * never the raw internal key (e.g. "p_video_image") that means nothing to
   * whoever is reading the Telegram digest.
   */
  private async aiServiceDisplayNames(): Promise<Record<string, string>> {
    const rows = await this.mediaAiSettingsRepository.find({
      select: { aiService: true, name: true },
    });
    const map: Record<string, string> = {};
    for (const row of rows) map[row.aiService] = row.name;
    return map;
  }

  /**
   * Relabels raw aiService keys to their display name, SUMMING counts when
   * multiple aiServices share one name (e.g. p_video_text and p_video_image
   * are both sold to users as "YEngine") — otherwise they'd show as two
   * separate, confusingly-duplicate lines instead of one merged total.
   */
  private relabelAndMerge(
    counts: Record<string, number>,
    displayNames: Record<string, string>,
  ): Record<string, number> {
    const merged: Record<string, number> = {};
    for (const [aiService, count] of Object.entries(counts)) {
      const label = displayNames[aiService] ?? aiService;
      merged[label] = (merged[label] ?? 0) + count;
    }
    return merged;
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
