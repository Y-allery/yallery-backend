import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';

@Injectable()
@Processor('x_router', {
  concurrency: 20,
  lockDuration: 180000,
})
export class XRouterProcessor extends WorkerHost {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { createPostDto, userId } = job.data;
    const { generatedImages, suggestedTags } =
      await this.imageGenerationService.generateXRouter(createPostDto);
    const user = await this.imageGenerationService.getUser(userId);
    await this.imageGenerationService.updateUserCredits(user, createPostDto);
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      createPostDto,
      user,
      createPostDto.ai_service,
    );
    await this.imageGenerationService.notifyUserOfImageGeneration(+userId);

    return { data, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    try {
      const { userId } = job.data;
      if (!userId) {
        console.error(`[XRouterProcessor] onCompleted: userId is missing for job ${job.id}`);
        return;
      }

      const generatedImages = job.returnvalue;
      if (!generatedImages) {
        console.error(`[XRouterProcessor] onCompleted: generatedImages is missing for job ${job.id}`);
        return;
      }

      await this.notificationGateway.sendImageArrayNotification(
        userId.toString(),
        generatedImages,
        ActivityEnum.IMAGE_GENERATE_SPEND,
        false,
      );
    } catch (error) {
      console.error(`[XRouterProcessor] onCompleted error for job ${job.id}:`, error);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} for X-Router failed: ${err.message}`);

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      return;
    }

    const { userId } = job.data;
    await this.notificationGateway.sendErrorNotification(
      userId.toString(),
      ` ${err.message}`,
    );
  }
}


