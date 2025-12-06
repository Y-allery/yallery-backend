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
    
    if (!userId) {
      throw new Error('userId is required for image generation');
    }

    const prompt = createPostDto?.prompt || 'N/A';
    console.log(`[XRouterProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${createPostDto?.ai_service} | Prompt: ${prompt.substring(0, 50)}...`);

    try {
      const { generatedImages, suggestedTags } =
        await this.imageGenerationService.generateXRouter(createPostDto);
    
    if (!generatedImages || !Array.isArray(generatedImages) || generatedImages.length === 0) {
      throw new Error(
        `No images generated for X-Router. Generated images: ${JSON.stringify(generatedImages)}`,
      );
    }

    const user = await this.imageGenerationService.getUser(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    await this.imageGenerationService.updateUserCredits(user, createPostDto);
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      createPostDto,
      user,
      createPostDto.ai_service,
    );
    
      try {
        await this.imageGenerationService.notifyUserOfImageGeneration(+userId);
      } catch (error) {
        console.error(`[XRouterProcessor] Failed to notify user ${userId}:`, error);
        // Не кидаємо помилку, щоб не зламати весь процес
      }

      console.log(`[XRouterProcessor] Successfully generated ${generatedImages.length} images | Job: ${job.id} | User: ${userId} | Service: ${createPostDto?.ai_service}`);
      return { data, suggestedTags };
    } catch (error) {
      // Помилка буде залогована в onFailed
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    await this.handleCompletedNotification(job, false);
  }
}


