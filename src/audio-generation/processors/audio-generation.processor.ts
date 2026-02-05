import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { AudioGenerationService } from '../audio-generation.service';
import { BaseAudioProcessor } from './base-audio-processor';
import { AUDIO_GENERATION_QUEUE } from '../audio-generation.constants';

@Injectable()
@Processor(AUDIO_GENERATION_QUEUE, {
  concurrency: 30,
  lockDuration: 180000,
})
export class AudioGenerationProcessor extends BaseAudioProcessor {
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

    const prompt = (dto?.prompt || '').trim();
    if (!prompt) throw new Error('prompt is required');

    console.log(
      `[AudioGenerationProcessor] Starting | Job: ${job.id} | User: ${userId} | ai_service: ${dto?.ai_service} | video_url: ${srcVideoUrl.substring(0, 60)}...`,
    );

    const response = await this.audioGenerationService.generateAudio(dto);
    if (!response.uploadedVideoUrl) {
      throw new Error('Audio generation returned no uploadedVideoUrl');
    }

    const user = await this.userService.findById(userId);
    if (!user) throw new Error(`User with id ${userId} not found`);

    const tag = await this.audioGenerationService.getDefaultTag();
    const suggestedTags = await this.audioGenerationService.buildSuggestedTags(tag);
    const suggestedTagsForParams = suggestedTags.map((t) => ({
      id: t.id,
      name: t.name.replace('#', ''),
    }));

    const dimensions = await this.audioGenerationService.getVideoDimensionsSafe(
      response.uploadedVideoUrl,
    );

    let post = await this.audioGenerationService.createPostForAudioVideo(
      response.uploadedVideoUrl,
      user,
      tag,
      prompt,
      dto.ai_service,
      suggestedTagsForParams,
      dimensions?.width,
      dimensions?.height,
    );

    // charge credits
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

    // audio socket event (video with audio track)
    try {
      await this.notificationGateway.sendAudioNotification(
        userId.toString(),
        {
          uploadedVideoUrl: response.uploadedVideoUrl,
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          suggestedTags,
        },
        ActivityEnum.VIDEO_GENERATE_SPEND,
      );
    } catch {}

    return { generatedVideo: response.uploadedVideoUrl, post, suggestedTags };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    // handled in process by sendVideoNotification
    return;
  }
}

