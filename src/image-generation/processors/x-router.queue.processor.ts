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

    try {
      await this.imageGenerationService.updateUserCredits(user, createPostDto);
    } catch (error) {
      console.error(`[XRouterProcessor] Failed to update credits for user ${userId}:`, error);
      throw new Error(`Failed to update user credits: ${error.message}`);
    }

    let data;
    try {
      data = await this.imageGenerationService.saveGeneratedImages(
        generatedImages,
        createPostDto,
        user,
        createPostDto.ai_service,
      );
    } catch (error) {
      console.error(`[XRouterProcessor] Failed to save images for user ${userId}, credits already deducted:`, error);
      throw new Error(`Failed to save generated images: ${error.message}`);
    }
    
      try {
        await this.imageGenerationService.notifyUserOfImageGeneration(+userId);
      } catch (error) {
        console.error(`[XRouterProcessor] Failed to notify user ${userId}:`, error);
      }

      console.log(`[XRouterProcessor] Successfully generated ${generatedImages.length} images | Job: ${job.id} | User: ${userId} | Service: ${createPostDto?.ai_service}`);
      return { data, suggestedTags };
    } catch (error) {
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    await this.handleCompletedNotification(job, false);
  }
}


