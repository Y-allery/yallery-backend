import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';
import { BaseImageProcessor } from './base-image-processor';

@Injectable()
@Processor('x_router', {
  concurrency: 20,
  lockDuration: 180000,
})
export class XRouterProcessor extends BaseImageProcessor {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
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
    await this.handleCompletedNotification(job, false);
  }
}


