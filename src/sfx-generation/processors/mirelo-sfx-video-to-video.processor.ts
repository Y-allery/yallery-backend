import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { SfxAIEnum } from 'src/common/enums/ai.enum';
import { SfxGenerationService } from '../sfx-generation.service';
import { BaseSfxProcessor } from './base-sfx-processor';

@Injectable()
@Processor(SfxAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO, {
  concurrency: 30,
  lockDuration: 180000,
})
export class MireloSfxVideoToVideoProcessor extends BaseSfxProcessor {
  constructor(
    private readonly sfxGenerationService: SfxGenerationService,
    private readonly userService: UserService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<any, any, string>) {
    const { dto, userId } = job.data;
    if (!userId) throw new Error('userId is required for SFX generation');

    const srcVideoUrl = (dto?.video_url || '').trim();
    if (!srcVideoUrl) throw new Error('video_url is required');

    console.log(
      `[MireloSfxVideoToVideoProcessor] Starting | Job: ${job.id} | User: ${userId} | video_url: ${srcVideoUrl.substring(0, 60)}...`,
    );

    const response = await this.sfxGenerationService.generateSfx(dto);
    if (!response.uploadedVideoUrl) {
      throw new Error('SFX generation returned no uploadedVideoUrl');
    }

    const user = await this.userService.findById(userId);
    if (!user) throw new Error(`User with id ${userId} not found`);

    // Choose tag by text_prompt if provided; else default.
    const prompt = (dto?.text_prompt || '').trim();
    const tag = await this.sfxGenerationService.resolveTag(prompt);

    const dimensions = await this.sfxGenerationService.getVideoDimensionsSafe(
      response.uploadedVideoUrl,
    );

    const suggestedTags = await this.sfxGenerationService.buildSuggestedTags(tag);
    const suggestedTagsForParams = suggestedTags.map((t) => ({
      id: t.id,
      name: t.name.replace('#', ''),
    }));

    let post = await this.sfxGenerationService.createPostForSfxVideo(
      response.uploadedVideoUrl,
      user,
      tag,
      prompt,
      suggestedTagsForParams,
      dimensions?.width,
      dimensions?.height,
    );
    post = await this.sfxGenerationService.getPostById(post.id);

    const cost = await this.sfxGenerationService.updateUserCredits(
      user,
      dto.ai_service,
    );

    try {
      await this.userService.sendPushNotificationIfEnabled(
        userId,
        ActivityEnum.VIDEO_GENERATE_SPEND,
      );
    } catch {}

    try {
      await this.sfxGenerationService.logActivityAndNotify(
        userId,
        ActivityEnum.VIDEO_GENERATE_SPEND,
        dto.ai_service,
        cost,
      );
    } catch {}

    return { generatedVideo: response.uploadedVideoUrl, post, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    await this.handleCompletedNotification(job);
  }
}

