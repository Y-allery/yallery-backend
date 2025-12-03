import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';

@Injectable()
@Processor(AIEnum.AURA_FLOW, {
  concurrency: 60,
  lockDuration: 120000,
})
export class SD3Processor extends WorkerHost {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { createPostDto, userId } = job.data;
    const { generatedImages, suggestedTags } =
      await this.imageGenerationService.generateFalAi(createPostDto);
    const user = await this.imageGenerationService.getUser(userId);
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      createPostDto,
      user,
      createPostDto.ai_service,
    );
    await this.imageGenerationService.updateUserCredits(user, createPostDto);
    await this.imageGenerationService.notifyUserOfImageGeneration(+userId);
    return { data, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    const { userId } = job.data;
    const generatedImages = job.returnvalue;
    await this.notificationGateway.sendImageArrayNotification(
      userId.toString(),
      generatedImages,
      ActivityEnum.IMAGE_GENERATE_SPEND,
    );

  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} for AuraFlow failed: ${err.message}`);

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      // Job will be retried; attemptsMade info omitted from logs
    } else {
      const { userId } = job.data;
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        ` ${err.message}`,
      );
    }
  }
}
