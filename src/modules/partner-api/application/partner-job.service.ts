import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';
import {
  PartnerCallbackStatus,
  PartnerJobEntity,
} from '../entities/partner-job.entity';
import { PartnerHold } from './partner-billing.service';

export interface PartnerJobView {
  id: string;
  object: 'generation';
  status: string;
  model: string;
  created: number;
  data?: Array<{ url: string; seed?: number }>;
  usage?: { generation_time_ms: number; price_usd: number };
  error?: { type: string; message: string };
}

const unixSeconds = (date: Date): number =>
  Math.floor(new Date(date).getTime() / 1000);

@Injectable()
export class PartnerJobService {
  private readonly logger = new Logger(PartnerJobService.name);

  constructor(
    @InjectRepository(PartnerJobEntity)
    private readonly jobs: Repository<PartnerJobEntity>,
  ) {}

  async create(input: {
    partnerKey: PartnerApiKeyEntity;
    model: string;
    capability: string;
    request: Record<string, unknown>;
    callbackUrl: string | null;
  }): Promise<PartnerJobEntity> {
    return this.jobs.save(
      this.jobs.create({
        publicId: `job_${randomBytes(12).toString('hex')}`,
        partnerKeyId: input.partnerKey.id,
        accountId: input.partnerKey.accountId ?? null,
        model: input.model,
        capability: input.capability,
        request: input.request,
        status: 'queued',
        callbackUrl: input.callbackUrl,
        callbackStatus: input.callbackUrl ? 'pending' : 'none',
        callbackDeliveryId: input.callbackUrl ? randomUUID() : null,
      }),
    );
  }

  /** Records the money reserved for this job, so a crashed worker can still be settled. */
  async attachHold(jobId: number, hold: PartnerHold): Promise<void> {
    await this.jobs.update(
      { id: jobId },
      { usageId: hold.usageId, heldUsd: hold.heldUsd.toFixed(4) },
    );
  }

  async markRunning(jobId: number): Promise<void> {
    await this.jobs.update(
      { id: jobId },
      { status: 'running', startedAt: new Date() },
    );
  }

  async markSucceeded(
    jobId: number,
    result: {
      data: Array<{ url: string; seed?: number }>;
      usage: { generation_time_ms: number; price_usd: number };
    },
  ): Promise<void> {
    await this.jobs.update(
      { id: jobId },
      { status: 'succeeded', result, finishedAt: new Date() },
    );
  }

  async markFailed(
    jobId: number,
    error: { type: string; message: string },
  ): Promise<void> {
    await this.jobs.update(
      { id: jobId },
      {
        status: 'failed',
        errorType: error.type.slice(0, 64),
        errorMessage: error.message.slice(0, 500),
        finishedAt: new Date(),
      },
    );
  }

  /**
   * Claims a job that never finished — the process died mid-generation, or BullMQ gave up
   * on it. Conditional on the current status so a worker that comes back to life cannot
   * overwrite a job someone else already closed.
   */
  async abandon(
    jobId: number,
    message: string,
  ): Promise<PartnerJobEntity | null> {
    const claimed = await this.jobs
      .createQueryBuilder()
      .update(PartnerJobEntity)
      .set({
        status: 'failed',
        errorType: 'generation_error',
        errorMessage: message.slice(0, 500),
        finishedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :id', { id: jobId })
      .andWhere('status IN (:...open)', { open: ['queued', 'running'] })
      .execute();

    if (!claimed.affected) return null;
    this.logger.error(`partner job ${jobId} abandoned: ${message}`);
    return this.jobs.findOne({ where: { id: jobId } });
  }

  async findById(jobId: number): Promise<PartnerJobEntity | null> {
    return this.jobs.findOne({ where: { id: jobId } });
  }

  /**
   * Looks a job up on behalf of a key. Scoped by account where there is one, so every key
   * on an account can read the account's jobs; internal keys (no account) see only their own.
   */
  async findForKey(
    publicId: string,
    key: PartnerApiKeyEntity,
  ): Promise<PartnerJobEntity> {
    const job = await this.jobs.findOne({
      where:
        key.accountId != null
          ? { publicId, accountId: key.accountId }
          : { publicId, partnerKeyId: key.id },
    });
    if (!job) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            param: 'id',
            message: `No job '${publicId}' on this account.`,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return job;
  }

  async recordDeliveryAttempt(
    jobId: number,
    outcome: {
      status: PartnerCallbackStatus;
      httpStatus: number | null;
      error: string | null;
    },
  ): Promise<void> {
    await this.jobs
      .createQueryBuilder()
      .update(PartnerJobEntity)
      .set({
        callbackStatus: outcome.status,
        callbackAttempts: () => 'callbackAttempts + 1',
        callbackLastStatus: outcome.httpStatus,
        callbackLastError: outcome.error?.slice(0, 255) ?? null,
        ...(outcome.status === 'delivered' && {
          deliveredAt: () => 'CURRENT_TIMESTAMP',
        }),
      })
      .where('id = :id', { id: jobId })
      .execute();
  }

  /** Closes delivery after the last retry. Not an attempt, so the counter stays honest. */
  async markCallbackGaveUp(jobId: number): Promise<void> {
    await this.jobs.update(
      { id: jobId, callbackStatus: 'pending' },
      { callbackStatus: 'failed' },
    );
  }

  view(job: PartnerJobEntity): PartnerJobView {
    const base: PartnerJobView = {
      id: job.publicId,
      object: 'generation',
      status: job.status,
      model: job.model,
      created: unixSeconds(job.createdAt),
    };
    if (job.status === 'succeeded' && job.result) {
      const result = job.result as Pick<PartnerJobView, 'data' | 'usage'>;
      return { ...base, data: result.data ?? [], usage: result.usage };
    }
    if (job.status === 'failed') {
      return {
        ...base,
        error: {
          type: job.errorType ?? 'generation_error',
          message: job.errorMessage ?? 'Generation failed.',
        },
      };
    }
    return base;
  }
}
