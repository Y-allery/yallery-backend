import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';
import { GenerateImageDto } from '../dto/generate.image.dto';
import { EditImageDto } from '../dto/edit-image.dto';
import { BaseImageProcessor } from './base-image-processor';

@Injectable()
@Processor('fal_ai', {
  concurrency: 60,
  lockDuration: 120000,
})
export class FalAiProcessor extends BaseImageProcessor {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<any, any, string>) {
    const { createPostDto, editImageDto, userId, aiService } = job.data;

    const serviceName = editImageDto ? AIEnum.BYTEDANCE_EDIT : (createPostDto?.ai_service || aiService);
    const prompt = editImageDto?.prompt || createPostDto?.prompt || 'N/A';
    
    console.log(`[FalAiProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${serviceName} | Prompt: ${prompt.substring(0, 50)}...`);

    let generatedImages: string[];
    let suggestedTags: { id: number; name: string }[];
    let dto: GenerateImageDto | EditImageDto;
    let service: AIEnum;

    try {
      if (editImageDto) {
        const result = await this.imageGenerationService.generateBytedanceEdit(
          editImageDto,
        );
        generatedImages = result.generatedImages;
        suggestedTags = result.suggestedTags;
        dto = editImageDto;
        service = AIEnum.BYTEDANCE_EDIT;
      } else {
        if (!createPostDto) {
          throw new Error('createPostDto is required when editImageDto is not provided');
        }
        const result = await this.imageGenerationService.generateFalAi(
          createPostDto,
        );
        generatedImages = result.generatedImages;
        suggestedTags = result.suggestedTags;
        dto = createPostDto;
        service = createPostDto.ai_service;
      }

      if (!userId) {
        throw new Error('userId is required for image generation');
      }

      if (!generatedImages || !Array.isArray(generatedImages) || generatedImages.length === 0) {
        throw new Error(
          `No images generated for service ${service}. Generated images: ${JSON.stringify(generatedImages)}`,
        );
      }

      const user = await this.imageGenerationService.getUser(userId);
      if (!user) {
        throw new Error(`User with id ${userId} not found`);
      }

      await this.imageGenerationService.updateUserCredits(user, dto);
      const data = await this.imageGenerationService.saveGeneratedImages(
        generatedImages,
        dto,
        user,
        service,
      );
      
      try {
        await this.imageGenerationService.notifyUserOfImageGeneration(+userId);
      } catch (error) {
        console.error(`[FalAiProcessor] Failed to notify user ${userId}:`, error);
        // Не кидаємо помилку, щоб не зламати весь процес
      }

      console.log(`[FalAiProcessor] Successfully generated ${generatedImages.length} images | Job: ${job.id} | User: ${userId} | Service: ${serviceName}`);
      return { data, suggestedTags };
    } catch (error) {
      // Помилка буде залогована в onFailed
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    const { editImageDto } = job.data;
    const isEdit = !!editImageDto;
    await this.handleCompletedNotification(job, isEdit);
  }
}

