import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { AudioAIEnum } from 'src/common/enums/ai.enum';
import { AudioGenerationService } from '../audio-generation.service';
import { BaseAudioProcessor } from './base-audio-processor';

@Injectable()
@Processor(AudioAIEnum.MMAUDIO_V2, {
  concurrency: 30,
  lockDuration: 180000,
})
export class MireloAudioVideoToVideoProcessor extends BaseAudioProcessor {
  constructor(
    private readonly audioGenerationService: AudioGenerationService,
    private readonly userService: UserService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<any, any, string>) {
    const { dto, userId } = job.data;
    if (!userId) throw new Error('userId is required for audio generation');

    const srcVideoUrl = (dto?.video_url || '').trim();
    if (!srcVideoUrl) throw new Error('video_url is required');

    console.log(
      `[MireloAudioVideoToVideoProcessor] Starting | Job: ${job.id} | User: ${userId} | video_url: ${srcVideoUrl.substring(0, 60)}...`,
    );

    const response = await this.audioGenerationService.generateAudio(dto);
    if (!response.uploadedVideoUrl) {
      throw new Error('Audio generation returned no uploadedVideoUrl');
    }

    const user = await this.userService.findById(userId);
    if (!user) throw new Error(`User with id ${userId} not found`);

    const prompt = (dto?.prompt || '').trim();
    const tag = await this.audioGenerationService.resolveTag(prompt);

    const dimensions = await this.audioGenerationService.getVideoDimensionsSafe(
      response.uploadedVideoUrl,
    );

    const suggestedTags = await this.audioGenerationService.buildSuggestedTags(tag);
    const suggestedTagsForParams = suggestedTags.map((t) => ({
      id: t.id,
      name: t.name.replace('#', ''),
    }));

    let post = await this.audioGenerationService.createPostForAudioVideo(
      response.uploadedVideoUrl,
      user,
      tag,
      prompt,
      suggestedTagsForParams,
      dimensions?.width,
      dimensions?.height,
    );
    post = await this.audioGenerationService.getPostById(post.id);

    const cost = await this.audioGenerationService.updateUserCredits(
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
      await this.audioGenerationService.logActivityAndNotify(
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

