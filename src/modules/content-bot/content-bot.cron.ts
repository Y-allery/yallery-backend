import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from 'src/core/database/redis.service.connect';
import { ContentBotService } from './content-bot.service';

/**
 * Thin cron host for the content bot. Every job is gated by CONTENT_BOT_ENABLED
 * (off by default) and wrapped in a cross-instance Redis fencing lock so it runs
 * once even when several backend instances are live (e.g. during a deploy).
 */
@Injectable()
export class ContentBotCron {
  private readonly logger = new Logger(ContentBotCron.name);

  constructor(
    private readonly bot: ContentBotService,
    private readonly redisService: RedisService,
  ) {}

  /** Build the day's plan (idempotent). */
  @Cron('0 7 * * *')
  async planDay(): Promise<void> {
    await this.locked('contentbot:plan:lock', 600, async () => {
      const cfg = await this.bot.loadConfig();
      if (!cfg.enabled) return;
      await this.bot.ensureBotUser();
      const rows = await this.bot.planDay();
      this.logger.log(`planned ${rows.length} items for today`);
    });
  }

  /** Generate in a few windows so the RunPod worker stays warm within a batch. */
  @Cron('0 8,13,18 * * *')
  async generate(): Promise<void> {
    await this.locked('contentbot:generate:lock', 3600, async () => {
      const cfg = await this.bot.loadConfig();
      if (!cfg.enabled) return;
      await this.bot.planDay(); // self-heal if the plan cron was missed
      const perWindow = Math.max(1, Math.ceil(cfg.dailyPosts / 3));
      const res = await this.bot.generateBatch(perWindow);
      this.logger.log(
        `generate: enqueued ${res.enqueued}, failed ${res.failed}` +
          (res.skipped ? ` (${res.skipped})` : ''),
      );
    });
  }

  /** Reconcile failures and publish paced across the day. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async publish(): Promise<void> {
    await this.locked('contentbot:publish:lock', 600, async () => {
      const cfg = await this.bot.loadConfig();
      if (!cfg.enabled) return;
      await this.bot.reconcileGenerating();
      const res = await this.bot.publishDuePaced();
      if (res.published > 0) {
        this.logger.log(`published ${res.published} bot posts`);
      }
    });
  }

  /** Evening Telegram digest of the day's output. */
  @Cron('0 21 * * *')
  async digest(): Promise<void> {
    await this.locked('contentbot:digest:lock', 600, async () => {
      const cfg = await this.bot.loadConfig();
      if (!cfg.enabled) return;
      await this.bot.sendDigest();
    });
  }

  private async locked(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<void>,
  ): Promise<void> {
    const token = await this.redisService.acquireLock(key, ttlSeconds);
    if (!token) return;
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `${key} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      await this.redisService.releaseLock(key, token);
    }
  }
}
