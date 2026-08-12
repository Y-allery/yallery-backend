import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { RunpodMediaClient } from '../media-generation/infrastructure/providers/runpod/runpod-media.client';
import { PartnerJobEntity } from '../partner-api/entities/partner-job.entity';
import { ProviderRuntimeConfigService } from '../provider-settings/provider-runtime-config.service';

// Each endpoint gets the cheapest job it will accept. Video: the smallest clip the LTX
// pipeline allows — dimensions multiples of 64 and frames 8k+1, anything smaller trips the
// latent-shape gate (~2-4s of GPU). Image: one small square (~2s).
const IMAGE_KEEPALIVE_INPUT: Record<string, unknown> = {
  prompt: 'keepalive',
  width: 512,
  height: 512,
  num_images: 1,
  output_format: 'png',
  return_base64: true,
  return_data_uri: true,
};

const KEEPALIVE_INPUT: Record<string, unknown> = {
  prompt: 'keepalive',
  width: 448,
  height: 256,
  frames: 17,
  fps: 24,
  audio: false,
  tier: 'fast',
  seed: 1,
  enhance: false,
};

/**
 * Keeps the video workers' FlashBoot freeze fresh.
 *
 * A paused worker resumes in ~1.5s while its VRAM snapshot is fresh, but after hours idle
 * the host reclaims the VRAM and the next caller pays a full cold start instead of ~27s.
 * A micro job through an idle window resets that clock for ~$1-2/day.
 *
 * Two lessons from the 2026-08-13 incident are baked in here:
 *
 * - A ping is only useful against a LIVE endpoint. When every worker is stuck initializing
 *   (the wedged-host failure we have now hit four times), pings just rot in the queue and
 *   make the pile-up worse — that night 40+ of the queued jobs were our own keepalives from
 *   two nodes. So the tick now looks at the endpoint's health first and refuses to feed a
 *   dead queue, shouting into the error log instead.
 *
 * - "There was traffic recently" must mean traffic that FINISHED. The old check counted
 *   created rows, so jobs rotting in a dead queue read as warmth and suppressed the pings
 *   exactly when the endpoint was broken.
 */
@Injectable()
export class WorkerKeepaliveService {
  private readonly logger = new Logger(WorkerKeepaliveService.name);
  private readonly lastPingAt = new Map<string, Date>();
  private readonly wedgedSince = new Map<string, Date>();

  constructor(
    private readonly runtimeConfig: ProviderRuntimeConfigService,
    private readonly runpodClient: RunpodMediaClient,
    @InjectRepository(PartnerJobEntity)
    private readonly partnerJobs: Repository<PartnerJobEntity>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<void> {
    // Both nodes carry this module; only one should ping. The engine owns it — the product
    // node sets this env so the two don't double every micro job (and, during an outage,
    // don't fill the dead queue twice as fast).
    if (process.env.WORKER_KEEPALIVE_DISABLED === 'true') return;
    try {
      if (
        (await this.runtimeConfig.getStringFresh(
          'WORKER_KEEPALIVE_ENABLED',
        )) !== 'true'
      ) {
        return;
      }
      const idleMinutes = await this.getNumber(
        'WORKER_KEEPALIVE_IDLE_MINUTES',
        25,
      );
      const idleMs = idleMinutes * 60_000;
      const now = Date.now();

      if (await this.hadRecentCompletedTraffic(new Date(now - idleMs))) {
        return; // real, finished traffic keeps the freeze fresh — no ping needed
      }

      const pings = await this.getNumber('WORKER_KEEPALIVE_PINGS', 2);
      await this.pingEndpoint('RUNPOD_P_VIDEO_ENDPOINT_ID', KEEPALIVE_INPUT, pings, idleMs, now);

      // The image endpoint stales the same way, and a caller who waits 100s for a picture
      // that normally takes 2s notices it more than a slow clip. One ping is enough there:
      // images are fast, so a single warm slot absorbs a burst.
      if ((await this.runtimeConfig.getStringFresh('WORKER_KEEPALIVE_IMAGES')) === 'true') {
        await this.pingEndpoint(
          'RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID',
          IMAGE_KEEPALIVE_INPUT,
          1,
          idleMs,
          now,
        );
      }
    } catch (error) {
      this.logger.warn(`keepalive tick failed: ${String(error)}`);
    }
  }

  private async pingEndpoint(
    endpointConfigKey: string,
    input: Record<string, unknown>,
    pings: number,
    idleMs: number,
    now: number,
  ): Promise<void> {
    const last = this.lastPingAt.get(endpointConfigKey);
    if (last && now - last.getTime() < idleMs) return;

    const endpointId = await this.runtimeConfig.getStringFresh(endpointConfigKey);
    if (!endpointId) {
      this.logger.warn(`keepalive skipped: ${endpointConfigKey} is not configured`);
      return;
    }

    if (await this.isWedged(endpointId)) return;

    const results = await Promise.allSettled(
      Array.from({ length: pings }, () =>
        this.runpodClient.submitJob(
          endpointId,
          { input: { ...input } },
          'RUNPOD_VIDEO_API_KEY',
        ),
      ),
    );
    this.lastPingAt.set(endpointConfigKey, new Date());

    const submitted: string[] = [];
    let failed = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        submitted.push(result.value.id);
      } else {
        failed += 1;
      }
    }
    this.logger.log(
      `keepalive pinged ${endpointId}: submitted=${submitted.join(',') || 'none'} failed=${failed}`,
    );
  }

  /**
   * A queue with not one live worker behind it is the wedged-host signature: the jobs are
   * never coming out, and anything we submit joins them. Feeding it would also keep
   * hadRecentCompletedTraffic false forever, so the two guards reinforce each other.
   *
   * This deliberately does not try to self-heal. The only remedy we have verified is a
   * workersMax bounce with FlashBoot dropped, which throws away every warm snapshot — too
   * blunt to fire automatically on a counter. Detection is loud; the fix stays a decision.
   */
  private async isWedged(endpointId: string): Promise<boolean> {
    let health: Awaited<ReturnType<RunpodMediaClient['fetchEndpointHealth']>>;
    try {
      health = await this.runpodClient.fetchEndpointHealth(
        endpointId,
        'RUNPOD_VIDEO_API_KEY',
      );
    } catch (error) {
      // No health, no verdict. Skip this round rather than ping blind.
      this.logger.warn(`keepalive: health check failed for ${endpointId}: ${String(error)}`);
      return true;
    }

    const alive =
      health.workers.ready + health.workers.running + health.workers.idle;
    const wedged = health.jobs.inQueue > 0 && alive === 0;

    if (!wedged) {
      this.wedgedSince.delete(endpointId);
      return false;
    }

    const since = this.wedgedSince.get(endpointId) ?? new Date();
    this.wedgedSince.set(endpointId, since);
    this.logger.error(
      `keepalive: endpoint ${endpointId} looks wedged since ${since.toISOString()} — ` +
        `queue=${health.jobs.inQueue}, initializing=${health.workers.initializing}, ` +
        `no live workers. Not pinging a dead queue; it needs a workersMax bounce.`,
    );
    return true;
  }

  private async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.runtimeConfig.getStringFresh(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async hadRecentCompletedTraffic(since: Date): Promise<boolean> {
    // Only a job that came OUT the other end proves a worker is warm. Created-but-queued
    // rows are, if anything, evidence of the opposite — see the 2026-08-13 incident.
    const recent = await this.partnerJobs.count({
      where: { status: 'succeeded', finishedAt: MoreThan(since) },
    });
    return recent > 0;
  }
}
