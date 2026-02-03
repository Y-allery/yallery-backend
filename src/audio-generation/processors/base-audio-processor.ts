import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';

export abstract class BaseAudioProcessor extends WorkerHost {
  constructor(protected readonly notificationGateway: NotificationGateway) {
    super();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    const { aiService, userId, dto } = job.data ?? {};
    const resolvedService = aiService || dto?.ai_service;
    const processorName = this.constructor.name;

    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(
      `Job ${job.id} for ${resolvedService || 'unknown'} failed in ${processorName}: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`,
    );

    if (attemptsMade < maxAttempts) {
      console.log(
        `[${processorName}] Job ${job.id} will be retried (${attemptsMade + 1}/${maxAttempts})`,
      );
      return;
    }

    if (!userId) return;

    try {
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        `Audio generation failed: ${err.message}`,
      );
    } catch (error) {
      console.error(
        `[${processorName}] Failed to send error notification for job ${job.id}:`,
        error,
      );
    }
  }
}

