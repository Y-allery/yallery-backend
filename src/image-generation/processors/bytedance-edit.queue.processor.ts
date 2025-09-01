import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ImageGenerationService } from '../image-generation.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum } from 'src/common/enums/ai.enum';

@Injectable()
@Processor(AIEnum.BYTEDANCE_EDIT, {
  concurrency: 60,
  lockDuration: 120000,
})
export class BytedanceEditProcessor extends WorkerHost {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { editImageDto, userId } = job.data;
    const { generatedImages, suggestedTags } =
      await this.imageGenerationService.generateBytedanceEdit(editImageDto);
    const user = await this.imageGenerationService.getUser(userId);
    const data = await this.imageGenerationService.saveGeneratedImages(
      generatedImages,
      editImageDto,
      user,
      AIEnum.BYTEDANCE_EDIT,
    );
    await this.imageGenerationService.updateUserCredits(user, editImageDto);
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
              true,
    );

    console.log(`Job ${job.id} for Bytedance Edit completed successfully.`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} for Bytedance Edit failed: ${err.message}`);

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      console.log(
        `Job ${job.id} will be retried. Attempts made: ${attemptsMade}`,
      );
    } else {
      const { userId } = job.data;
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        ` ${err.message}`,
      );
    }
  }
} 