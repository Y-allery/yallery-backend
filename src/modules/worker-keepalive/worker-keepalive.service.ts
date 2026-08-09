import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RunpodMediaClient } from '../media-generation/infrastructure/providers/runpod/runpod-media.client';
import { MediaTextVideoWorkflowEntity } from '../media-generation/persistence/entities/media-text-video-workflow.entity';
import { ProviderRuntimeConfigService } from '../provider-settings/provider-runtime-config.service';

// The smallest clip the LTX pipeline accepts: dimensions must be multiples of 64 and
// frames 8k+1, anything smaller trips the latent-shape gate. ~2-4s of GPU per ping.
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
 * Keeps the RunPod video workers' FlashBoot freeze fresh. A paused worker resumes in ~1.5s
 * while its VRAM snapshot is fresh, but after hours idle the host reclaims the VRAM and the
 * next user pays ~59s instead of ~27s (measured 2026-08-09). A micro job every ~25 idle
 * minutes resets that clock for ~$1-2/day. Real traffic refreshes the freeze by itself,
 * so the ping is skipped whenever a recent video workflow exists.
 */
@Injectable()
export class WorkerKeepaliveService {
  private readonly logger = new Logger(WorkerKeepaliveService.name);
  private lastPingAt: Date | null = null;

  constructor(
    private readonly runtimeConfig: ProviderRuntimeConfigService,
    private readonly runpodClient: RunpodMediaClient,
    @InjectRepository(MediaTextVideoWorkflowEntity)
    private readonly videoWorkflows: Repository<MediaTextVideoWorkflowEntity>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<void> {
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

      if (this.lastPingAt && now - this.lastPingAt.getTime() < idleMs) {
        return;
      }
      const lastActivity = await this.getLastVideoActivity();
      if (lastActivity && now - lastActivity.getTime() < idleMs) {
        return; // real traffic keeps the freeze fresh — no ping needed
      }

      const endpointId = await this.runtimeConfig.getStringFresh(
        'RUNPOD_P_VIDEO_ENDPOINT_ID',
      );
      if (!endpointId) {
        this.logger.warn(
          'keepalive skipped: RUNPOD_P_VIDEO_ENDPOINT_ID is not configured',
        );
        return;
      }

      const pings = await this.getNumber('WORKER_KEEPALIVE_PINGS', 2);
      const results = await Promise.allSettled(
        Array.from({ length: pings }, () =>
          this.runpodClient.submitJob(
            endpointId,
            { input: { ...KEEPALIVE_INPUT } },
            'RUNPOD_VIDEO_API_KEY',
          ),
        ),
      );
      this.lastPingAt = new Date();
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
    } catch (error) {
      this.logger.warn(`keepalive tick failed: ${String(error)}`);
    }
  }

  private async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.runtimeConfig.getStringFresh(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async getLastVideoActivity(): Promise<Date | null> {
    // media_text_video_workflows carries both t2v and i2v runs against the P-Video endpoint;
    // updatedAt moves on every state transition, which is exactly "the worker did something".
    const latest = await this.videoWorkflows.find({
      select: { updatedAt: true },
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    return latest[0]?.updatedAt ?? null;
  }
}
