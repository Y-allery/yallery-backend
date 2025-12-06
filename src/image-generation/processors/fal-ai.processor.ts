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

    let generatedImages: string[];
    let suggestedTags: { id: number; name: string }[];
    let dto: GenerateImageDto | EditImageDto;
    let service: AIEnum;

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

    const user = await this.imageGenerationService.getUser(userId);
    await this.imageGenerationService.updateUserCredits(user, dto);
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      dto,
      user,
      service,
    );
    await this.imageGenerationService.notifyUserOfImageGeneration(+userId);

    return { data, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    const { editImageDto } = job.data;
    const isEdit = !!editImageDto;
    await this.handleCompletedNotification(job, isEdit);
  }
}

