import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';
import { GenerateImageDto } from '../dto/generate.image.dto';
import { EditImageDto } from '../dto/edit-image.dto';

@Injectable()
@Processor('fal_ai', {
  concurrency: 60,
  lockDuration: 120000,
})
export class FalAiProcessor extends WorkerHost {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
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
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      dto,
      user,
      service,
    );
    await this.imageGenerationService.updateUserCredits(user, dto);
    await this.imageGenerationService.notifyUserOfImageGeneration(+userId);

    return { data, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    const { userId, editImageDto } = job.data;
    const generatedImages = job.returnvalue;
    const isEdit = !!editImageDto;
    await this.notificationGateway.sendImageArrayNotification(
      userId.toString(),
      generatedImages,
      ActivityEnum.IMAGE_GENERATE_SPEND,
      isEdit,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    const { aiService } = job.data;
    console.error(`Job ${job.id} for ${aiService} failed: ${err.message}`);

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

