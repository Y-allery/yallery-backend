import { UserService } from './../../user/user.service';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AIEnum, VideoAIEnum } from 'src/common/enums/ai.enum';
import { VideoGenerationService } from '../video-generation.service';

@Injectable()
@Processor(VideoAIEnum.BYTY_DANCE, {
  concurrency: 60,
  lockDuration: 180000,
})
export class BytyDanceProcessor extends WorkerHost {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
    private readonly userService: UserService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { dto, userId } = job.data;
    const response = await this.videoGenerationService.generateVideo(dto);
    const findRelatedTag = await this.videoGenerationService.findBestTagByImage(
      dto.image_url,
    );
    const user = await this.userService.findById(userId);

    const post = await this.videoGenerationService.createPostForVideo(
      response.uploadedVideoUrl,
      user,
      findRelatedTag,
    );
    await this.videoGenerationService.updateUserCredits(user);
    await this.userService.sendPushNotificationIfEnabled(
      userId,
      ActivityEnum.VIDEO_GENERATE_SPEND,
    );

    await this.videoGenerationService.logActivityAndNotify(
      userId,
      ActivityEnum.VIDEO_GENERATE_SPEND,
      AIEnum.AURA_FLOW,
      100,
    );

    return {
      generatedVideo: response.uploadedVideoUrl,
      post,
      findRelatedTag,
    };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    const { userId } = job.data;
    const { generatedVideo, post, findRelatedTag } = job.returnvalue;
    await this.notificationGateway.sendVideoNotification(
      userId.toString(),
      {
        uploadedVideoUrl: generatedVideo,
        id: post.id,
        suggestedTags: [
          { id: findRelatedTag.id, name: `#${findRelatedTag.name}` },
          { id: 48, name: '#other' },
        ],
      },
      ActivityEnum.VIDEO_GENERATE_SPEND,
    );

    console.log(
      `Job ${job.id} for ${VideoAIEnum.BYTY_DANCE} completed successfully.`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    console.error(
      `Job ${job.id} for ${VideoAIEnum.BYTY_DANCE} failed: ${err.message}`,
    );

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
