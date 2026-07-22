import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { MediaGenerationEnqueueService } from 'src/modules/media-generation/application/enqueue/media-generation-enqueue.service';
import {
  randomVideoSeed,
  resolveVideoOrientation,
} from 'src/modules/media-generation/domain/presets';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { TelegramService } from 'src/integrations/telegram/telegram.service';
import {
  ContentBotMediaKind,
  ContentBotPlanEntity,
} from './entities/content-bot-plan.entity';
import { ContentBotPromptService } from './content-bot-prompt.service';
import {
  DEFAULT_TAG_WEIGHT,
  SFW_NEGATIVE_PROMPT,
  STYLE_HINTS,
  TAG_BLOCKLIST,
  TAG_WEIGHTS,
  templatesForTag,
} from './content-bot.prompts';

/**
 * Content bot orchestration. Rides the SAME generation pipeline as real users
 * (enqueue -> BullMQ worker -> RunPod -> generated draft post), but under a
 * dedicated bot user, then publishes the resulting drafts itself — bypassing
 * PostPublishService so NO rewards / tag-subscribe / contest side effects fire.
 *
 * Disabled by default (CONTENT_BOT_ENABLED). The crons no-op while disabled;
 * the only way to run before enabling is the admin preview endpoint, which
 * generates drafts (never published) for Telegram review.
 *
 * The bot is quarantined from metrics, daily rewards, contests and (by keeping
 * volume low + tag-varied) feed domination — see the quarantine edits in the
 * metrics collectors and daily-reward cron.
 */
@Injectable()
export class ContentBotService {
  private readonly logger = new Logger(ContentBotService.name);

  private static readonly BOT_EMAIL = 'content-bot@yallery.local';
  private static readonly BOT_NAME = 'Yallery Studio';
  private static readonly BOT_NICKNAME = 'yallery.studio';
  /** Points are the spend currency; keep the bot far above any single cost. */
  private static readonly POINTS_TARGET = 2_000_000;
  private static readonly POINTS_MIN = 200_000;
  private static readonly IMAGE_AI = 'qwen_image';
  private static readonly VIDEO_AI = 'p_video_text';
  private static readonly VIDEO_DURATION = 5;
  /** Cap drafts published per publish tick, so pacing can't burst. */
  private static readonly PUBLISH_PER_TICK_MAX = 3;
  /** Publishing is paced across this local-time window (hours). */
  private static readonly PUBLISH_WINDOW_START_H = 8;
  private static readonly PUBLISH_WINDOW_END_H = 22;
  /** Rough per-item GPU cost (USD) for the digest estimate only. */
  private static readonly EST_COST_IMAGE = 0.006;
  private static readonly EST_COST_VIDEO = 0.1;

  constructor(
    @InjectRepository(ContentBotPlanEntity)
    private readonly planRepository: Repository<ContentBotPlanEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MediaGenerationChargeEntity)
    private readonly chargeRepository: Repository<MediaGenerationChargeEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly enqueueService: MediaGenerationEnqueueService,
    private readonly telegramService: TelegramService,
    private readonly promptService: ContentBotPromptService,
  ) {}

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  async loadConfig() {
    const enabled = await this.providerRuntimeConfigService.getBoolean(
      'CONTENT_BOT_ENABLED',
      false, // getBoolean's own fallback defaults to TRUE — must pass false.
    );
    const configuredUserId = await this.providerRuntimeConfigService.getNumber(
      'CONTENT_BOT_USER_ID',
    );
    const dailyPosts = Math.max(
      0,
      Math.floor(
        (await this.providerRuntimeConfigService.getNumber(
          'CONTENT_BOT_DAILY_POSTS',
          3,
        )) ?? 3,
      ),
    );
    const videoShare = Math.min(
      1,
      Math.max(
        0,
        (await this.providerRuntimeConfigService.getNumber(
          'CONTENT_BOT_VIDEO_SHARE',
          0.6,
        )) ?? 0.6,
      ),
    );
    // Falls back to the shared ops chat so the digest lands in one place with
    // everything else, without requiring a second chat id to be configured.
    const tgChatId =
      (await this.providerRuntimeConfigService.getString(
        'CONTENT_BOT_TG_CHAT_ID',
      )) ||
      (await this.providerRuntimeConfigService.getString(
        'TELEGRAM_OPS_CHAT_ID',
      ));
    const maxDailyItems = Math.max(
      0,
      Math.floor(
        (await this.providerRuntimeConfigService.getNumber(
          'CONTENT_BOT_MAX_DAILY_ITEMS',
          50,
        )) ?? 50,
      ),
    );
    return {
      enabled,
      configuredUserId,
      dailyPosts,
      videoShare,
      tgChatId,
      maxDailyItems,
    };
  }

  // ---------------------------------------------------------------------------
  // Bot user + points
  // ---------------------------------------------------------------------------

  async ensureBotUser(): Promise<number> {
    const { configuredUserId } = await this.loadConfig();
    if (configuredUserId) {
      const existing = await this.userRepository.findOne({
        where: { id: configuredUserId },
        select: { id: true, points: true },
      });
      if (existing) {
        await this.topUp(existing.id);
        return existing.id;
      }
      this.logger.warn(
        `CONTENT_BOT_USER_ID=${configuredUserId} not found; re-resolving by email`,
      );
    }

    let bot = await this.userRepository.findOne({
      where: { email: ContentBotService.BOT_EMAIL },
      select: { id: true, points: true },
    });
    if (!bot) {
      bot = this.userRepository.create({
        name: ContentBotService.BOT_NAME,
        nickname: ContentBotService.BOT_NICKNAME,
        email: ContentBotService.BOT_EMAIL,
        role: RoleEnum.USER,
        emailVerified: true,
        bonusEligible: false,
        notificationsEnabled: false,
        points: ContentBotService.POINTS_TARGET,
      });
      bot = await this.userRepository.save(bot);
      this.logger.log(`Created content-bot user id=${bot.id}`);
    }

    await this.persistBotUserId(bot.id);
    await this.topUp(bot.id);
    return bot.id;
  }

  /**
   * Persists CONTENT_BOT_USER_ID (with retry). Every metrics/reward quarantine
   * filter resolves the bot solely from this setting, so a silent miss would
   * un-quarantine it — hence the retry and an error (not warn) on final failure.
   */
  private async persistBotUserId(id: number): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.providerRuntimeConfigService.updateSetting(
          'CONTENT_BOT_USER_ID',
          { value: String(id) },
          null,
        );
        return;
      } catch (error) {
        if (attempt === 3) {
          this.logger.error(
            `Failed to persist CONTENT_BOT_USER_ID after ${attempt} attempts: ${this.msg(
              error,
            )} — metrics/reward quarantine may miss the bot until the next ensure`,
          );
        }
      }
    }
  }

  async topUp(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, points: true },
    });
    if (!user) return;
    if (user.points >= ContentBotService.POINTS_MIN) return;
    const add = ContentBotService.POINTS_TARGET - user.points;
    if (add > 0) {
      await this.userRepository.increment({ id: userId }, 'points', add);
      this.logger.log(`Topped up bot ${userId} by ${add} points`);
    }
  }

  // ---------------------------------------------------------------------------
  // Planning
  // ---------------------------------------------------------------------------

  /** Creates today's (non-preview) plan rows if none exist yet, idempotent. */
  async planDay(targetCount?: number): Promise<ContentBotPlanEntity[]> {
    const cfg = await this.loadConfig();
    const planDate = this.todayStr();

    const existing = await this.planRepository.find({
      where: { planDate, isPreview: false },
    });
    if (existing.length > 0) return existing;

    const count = Math.min(targetCount ?? cfg.dailyPosts, cfg.maxDailyItems);
    if (count <= 0) return [];

    const rows = await this.buildPlanRows(count, false);
    return rows.length ? this.planRepository.save(rows) : [];
  }

  /**
   * Builds (but does not save) plan rows: deterministic tag/kind selection in
   * code (so contest-exclusion + distribution stay under our control), with the
   * prompt TEXT written by the LLM (static bank as fallback).
   */
  private async buildPlanRows(
    count: number,
    isPreview: boolean,
  ): Promise<ContentBotPlanEntity[]> {
    const cfg = await this.loadConfig();
    const planDate = this.todayStr();

    const [lockedTagIds, tagIndex] = await Promise.all([
      this.contestLockedTagIds(),
      this.tagIndex(),
    ]);

    const items = this.selectDailyItems(
      Math.min(count, cfg.maxDailyItems),
      cfg.videoShare,
      lockedTagIds,
      tagIndex,
    );
    if (items.length === 0) return [];

    const aiPrompts = await this.promptService.generate(
      items.map((it) => ({
        tag: it.tagName,
        mediaKind: it.mediaKind,
        styleHint: STYLE_HINTS[it.tagName],
      })),
    );

    return items.map((it, i) => {
      const aiPrompt = aiPrompts[i];
      const prompt = aiPrompt ?? this.fallbackPrompt(it.tagName, it.mediaKind);
      return this.planRepository.create({
        planDate,
        mediaKind: it.mediaKind,
        aiService:
          it.mediaKind === 'video'
            ? ContentBotService.VIDEO_AI
            : ContentBotService.IMAGE_AI,
        tagId: it.tagId,
        promptTemplateKey: aiPrompt ? `ai:${it.tagName}` : `bank:${it.tagName}`,
        promptText: prompt,
        // Advisory only: the RunPod worker owns per-model negatives; the backend
        // does not forward this to the worker. SFW rests on the LLM prompt-writer
        // instruction + OpenAI policy + the models' built-in NSFW protection.
        negativePrompt: SFW_NEGATIVE_PROMPT,
        seed: randomVideoSeed(),
        status: 'planned',
        isPreview,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  async generateBatch(
    limit: number,
  ): Promise<{ enqueued: number; failed: number; skipped: string | null }> {
    const cfg = await this.loadConfig();
    const botId = await this.ensureBotUser();
    await this.topUp(botId);

    const planDate = this.todayStr();
    const usedToday = await this.planRepository.count({
      where: {
        planDate,
        isPreview: false,
        status: In(['generating', 'generated', 'published', 'failed']),
      },
    });
    const remainingCap = Math.max(0, cfg.maxDailyItems - usedToday);
    const toDo = Math.min(limit, remainingCap);
    if (toDo <= 0) return { enqueued: 0, failed: 0, skipped: 'daily cap reached' };

    const planned = await this.planRepository.find({
      where: { planDate, status: 'planned', isPreview: false },
      order: { id: 'ASC' },
      take: toDo,
    });

    const { enqueued, failed } = await this.generatePlanRows(planned, botId);
    return { enqueued, failed, skipped: null };
  }

  /**
   * Enqueues each planned row (sequential on purpose: keeps the RunPod worker
   * warm within a batch so it pays one cold start, not one per item).
   */
  private async generatePlanRows(
    rows: ContentBotPlanEntity[],
    botId: number,
  ): Promise<{ enqueued: number; failed: number }> {
    let enqueued = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        row.taskId = await this.enqueueOne(row, botId);
        row.status = 'generating';
        await this.planRepository.save(row);
        enqueued++;
      } catch (error) {
        row.status = 'failed';
        row.failureReason = this.msg(error).slice(0, 250);
        await this.planRepository.save(row);
        failed++;
        this.logger.error(
          `generate failed (plan ${row.id}): ${row.failureReason}`,
        );
      }
    }
    return { enqueued, failed };
  }

  private async enqueueOne(
    row: ContentBotPlanEntity,
    botId: number,
  ): Promise<string> {
    const prompt = row.promptText ?? '';
    if (row.mediaKind === 'video') {
      const aiService = row.aiService ?? ContentBotService.VIDEO_AI;
      const orientation = resolveVideoOrientation(aiService, undefined);
      const job = await this.enqueueService.enqueueTextVideoGeneration(
        {
          aiService,
          prompt,
          orientation,
          duration: ContentBotService.VIDEO_DURATION,
          seed: row.seed ?? randomVideoSeed(),
          contestId: null,
        },
        botId,
      );
      return String(job.id);
    }

    const job = await this.enqueueService.enqueuePromptImageGeneration(
      {
        aiService: row.aiService ?? ContentBotService.IMAGE_AI,
        prompt,
        imageQuantity: 1,
        resolvedNegativePrompt: row.negativePrompt ?? undefined,
      },
      botId,
    );
    return String(job.id);
  }

  /** Marks generating rows failed when their generation charge was refunded. */
  async reconcileGenerating(): Promise<void> {
    // Not scoped to today: a job that refunds after midnight still needs its
    // (yesterday-dated) plan row flipped to 'failed'.
    const generating = await this.planRepository.find({
      where: { status: 'generating' },
    });
    for (const row of generating) {
      if (!row.taskId) continue;
      const charge = await this.chargeRepository.findOne({
        where: { jobId: row.taskId },
      });
      if (charge && charge.status === 'refunded') {
        row.status = 'failed';
        row.failureReason = 'generation refunded (worker failed)';
        await this.planRepository.save(row);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Publishing (paced, side-effect free)
  // ---------------------------------------------------------------------------

  async publishDuePaced(): Promise<{ published: number }> {
    const cfg = await this.loadConfig();
    const botId = await this.ensureBotUser();
    const planDate = this.todayStr();

    const target = Math.min(cfg.dailyPosts, cfg.maxDailyItems);
    const desiredByNow = Math.ceil(target * this.dayFraction());
    const publishedToday = await this.planRepository.count({
      where: { planDate, status: 'published', isPreview: false },
    });
    const budget = Math.max(
      0,
      Math.min(
        desiredByNow - publishedToday,
        ContentBotService.PUBLISH_PER_TICK_MAX,
      ),
    );
    if (budget <= 0) return { published: 0 };

    // Only today's NON-preview generating plans are publishable. Publishing ONLY
    // drafts that match one of these — and scoping the draft query to today —
    // is what guarantees preview drafts and prior-day leftovers are never
    // auto-published, and keeps the plan-status pace counter exact.
    const generatingPlans = await this.planRepository.find({
      where: { planDate, status: 'generating', isPreview: false },
    });
    if (generatingPlans.length === 0) return { published: 0 };

    const drafts = await this.postRepository.find({
      where: {
        user: { id: botId },
        isPublished: false,
        createdAt: MoreThanOrEqual(this.startOfToday()),
      },
      order: { id: 'ASC' },
      relations: { tag: true },
    });
    if (drafts.length === 0) return { published: 0 };

    const lockedTagIds = await this.contestLockedTagIds();

    let published = 0;
    for (const draft of drafts) {
      if (published >= budget) break;
      if (!draft.imageUrl && !draft.videoUrl) continue;

      const plan = this.matchDraftToPlan(draft, generatingPlans);
      if (!plan || plan.tagId == null) continue; // no publishable plan -> skip
      if (lockedTagIds.has(plan.tagId)) continue; // tag now contest-locked

      await this.publishDraft(draft, plan.tagId);
      plan.status = 'published';
      plan.postId = draft.id;
      await this.planRepository.save(plan);
      published++;
    }
    return { published };
  }

  /**
   * Best-effort draft->plan match by prompt (== same template) and, for video,
   * seed. A same-template ambiguity is harmless: the tag we then apply comes
   * from that template's own tag set, so it stays content-appropriate. Consumed
   * plans are spliced out so two drafts never claim one plan.
   */
  private matchDraftToPlan(
    draft: PostEntity,
    generatingPlans: ContentBotPlanEntity[],
  ): ContentBotPlanEntity | null {
    const params = (draft.generationParams ?? {}) as {
      prompt?: string;
      seed?: number;
    };
    const kind: ContentBotMediaKind = draft.videoUrl ? 'video' : 'image';
    const idx = generatingPlans.findIndex(
      (p) =>
        p.mediaKind === kind &&
        p.promptText === params.prompt &&
        (kind !== 'video' ||
          p.seed == null ||
          Number(params.seed) === p.seed),
    );
    if (idx < 0) return null;
    return generatingPlans.splice(idx, 1)[0];
  }

  /**
   * Publishes a generated draft WITHOUT PostPublishService — so no reward
   * eligibility, tag auto-subscribe or contest participation fires. Mirrors the
   * feed-visible field state of a user-published post.
   */
  private async publishDraft(draft: PostEntity, tagId: number): Promise<void> {
    draft.isPublished = true;
    draft.isSaved = false;
    draft.isBlocked = false;
    draft.isRejected = false;
    draft.isDelivered = true;
    draft.tag = { id: tagId } as TagEntity;
    await this.postRepository.save(draft);
  }

  // ---------------------------------------------------------------------------
  // Telegram digest
  // ---------------------------------------------------------------------------

  async sendDigest(): Promise<{ sent: boolean; items: number }> {
    const cfg = await this.loadConfig();
    if (!cfg.tgChatId) {
      this.logger.warn('digest: CONTENT_BOT_TG_CHAT_ID not set');
      return { sent: false, items: 0 };
    }
    const botId = await this.ensureBotUser();
    const planDate = this.todayStr();

    const posts = await this.postRepository.find({
      where: {
        user: { id: botId },
        createdAt: MoreThanOrEqual(this.startOfToday()),
      },
      order: { id: 'ASC' },
      relations: { tag: true },
    });
    const plans = await this.planRepository.find({ where: { planDate } });

    const publishedCount = posts.filter((p) => p.isPublished).length;
    const draftCount = posts.length - publishedCount;
    const failed = plans.filter((p) => p.status === 'failed').length;
    const estCost = this.estimateCost(plans);

    const summary =
      `🤖 <b>Content bot — ${planDate}</b>\n` +
      `Generated: ${posts.length} (live ${publishedCount}, draft ${draftCount})\n` +
      `Failed: ${failed}\n` +
      `Est. GPU cost: ~$${estCost.toFixed(2)}\n` +
      `Mode: ${cfg.enabled ? 'LIVE' : 'PREVIEW (publishing off)'}`;
    await this.telegramService.sendMessage(cfg.tgChatId, summary);

    const media = posts
      .filter((p) => p.imageUrl || p.videoUrl)
      .slice(0, 30)
      .map((p) => ({
        type: (p.videoUrl ? 'video' : 'photo') as 'video' | 'photo',
        media: (p.videoUrl ?? p.imageUrl) as string,
        caption: `${p.isPublished ? '✅ live' : '🕒 draft'} · #${
          p.tag?.name ?? '—'
        }`,
      }));
    if (media.length > 0) {
      await this.telegramService.sendMediaGroup(cfg.tgChatId, media);
    }
    return { sent: true, items: media.length };
  }

  // ---------------------------------------------------------------------------
  // Preview (manual, admin) — generate drafts, never publish
  // ---------------------------------------------------------------------------

  async runPreview(
    count: number,
  ): Promise<{
    botUserId: number;
    planned: number;
    enqueued: number;
    failed: number;
  }> {
    const botId = await this.ensureBotUser();
    await this.topUp(botId);
    // Self-contained preview rows (isPreview=true) so the publisher never
    // touches them and preview never counts against / interferes with the
    // daily cron plan.
    const rows = await this.buildPlanRows(count, true);
    if (rows.length === 0) {
      return { botUserId: botId, planned: 0, enqueued: 0, failed: 0 };
    }
    const saved = await this.planRepository.save(rows);
    const { enqueued, failed } = await this.generatePlanRows(saved, botId);
    return { botUserId: botId, planned: saved.length, enqueued, failed };
  }

  async status() {
    const cfg = await this.loadConfig();
    const planDate = this.todayStr();
    const plans = await this.planRepository.find({ where: { planDate } });
    const byStatus = plans.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});
    let botPoints: number | null = null;
    if (cfg.configuredUserId) {
      const user = await this.userRepository.findOne({
        where: { id: cfg.configuredUserId },
        select: { id: true, points: true },
      });
      botPoints = user?.points ?? null;
    }
    return {
      config: cfg,
      planDate,
      total: plans.length,
      plan: byStatus,
      botPoints,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private selectDailyItems(
    count: number,
    videoShare: number,
    lockedTagIds: Set<number>,
    tagIndex: Map<string, number>,
  ): Array<{ tagId: number; tagName: string; mediaKind: ContentBotMediaKind }> {
    const eligible: Array<{ name: string; id: number; weight: number }> = [];
    for (const [name, id] of tagIndex.entries()) {
      if (lockedTagIds.has(id) || TAG_BLOCKLIST.has(name)) continue;
      eligible.push({
        name,
        id,
        weight: TAG_WEIGHTS[name] ?? DEFAULT_TAG_WEIGHT,
      });
    }
    if (eligible.length === 0) return [];

    const nVideo = Math.round(count * videoShare);
    const kinds: ContentBotMediaKind[] = [
      ...Array(nVideo).fill('video' as const),
      ...Array(Math.max(0, count - nVideo)).fill('image' as const),
    ];
    this.shuffle(kinds);

    return kinds.map((mediaKind) => {
      const pick = this.weightedPick(eligible, (e) => e.weight);
      return { tagId: pick.id, tagName: pick.name, mediaKind };
    });
  }

  private fallbackPrompt(tagName: string, kind: ContentBotMediaKind): string {
    const templates = templatesForTag(tagName);
    if (templates.length > 0) {
      return this.weightedPick(
        templates,
        (tpl) => tpl.weight * (kind === 'video' && tpl.preferVideo ? 1.5 : 1),
      ).prompt;
    }
    return `a striking, high-quality ${
      kind === 'video' ? 'cinematic video' : 'photograph'
    } on the theme of "${tagName}", tasteful, elegant and richly detailed, adults only, no real people`;
  }

  private weightedPick<T>(items: T[], weightOf: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weightOf(item), 0);
    let r = Math.random() * total;
    for (const item of items) {
      r -= weightOf(item);
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  private async contestLockedTagIds(): Promise<Set<number>> {
    const rows: Array<{ tagId: number }> = await this.planRepository.query(
      "SELECT DISTINCT tagId FROM contests WHERE status IN ('upcoming','open','pending_review') AND tagId IS NOT NULL",
    );
    return new Set(rows.map((r) => Number(r.tagId)));
  }

  private async tagIndex(): Promise<Map<string, number>> {
    const tags = await this.tagRepository.find({
      select: { id: true, name: true },
    });
    const index = new Map<string, number>();
    for (const tag of tags) index.set(tag.name.toLowerCase(), tag.id);
    return index;
  }

  private estimateCost(plans: ContentBotPlanEntity[]): number {
    return plans
      .filter((p) => p.status !== 'failed')
      .reduce(
        (sum, p) =>
          sum +
          (p.mediaKind === 'video'
            ? ContentBotService.EST_COST_VIDEO
            : ContentBotService.EST_COST_IMAGE),
        0,
      );
  }

  private dayFraction(): number {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const start = ContentBotService.PUBLISH_WINDOW_START_H * 60;
    const end = ContentBotService.PUBLISH_WINDOW_END_H * 60;
    if (minutes <= start) return 0;
    if (minutes >= end) return 1;
    return (minutes - start) / (end - start);
  }

  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }

  private todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
