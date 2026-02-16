import { UserService } from './../../user/user.service';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { VideoAIEnum } from 'src/common/enums/ai.enum';
import { VideoGenerationService } from '../video-generation.service';
import { BaseVideoProcessor } from './base-video-processor';

@Injectable()
@Processor(VideoAIEnum.KLING_TEXT_TO_VIDEO, {
  concurrency: 60,
  lockDuration: 180000,
})
export class KlingTextToVideoProcessor extends BaseVideoProcessor {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
    private readonly userService: UserService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<any, any, string>) {
    const { dto, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for video generation');
    }

    const prompt = dto?.prompt || '';
    console.log(
      `[KlingTextToVideoProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${dto?.ai_service} | Prompt: ${prompt.substring(0, 50)}...`,
    );

    if (!prompt.trim()) {
      throw new Error('prompt is required for text-to-video generation');
    }

    try {
      const response = await this.videoGenerationService.generateVideo(dto);
      if (!response.uploadedVideoUrl) {
        throw new Error(
          `Video generation failed: no video URL returned. Response: ${JSON.stringify(response)}`,
        );
      }

      let tag;
      try {
        tag = await this.videoGenerationService.findBestTagByPrompt(prompt);
      } catch (aiError) {
        console.warn(
          `[KlingTextToVideoProcessor] Tag selection failed for user ${userId}, using default tag:`,
          aiError.message,
        );
        tag = await this.videoGenerationService.getDefaultTag();
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new Error(`User with id ${userId} not found`);
      }

      // Get video dimensions from Cloudinary (optional)
      let videoWidth: number | undefined;
      let videoHeight: number | undefined;
      try {
        const dimensions = await this.videoGenerationService.getVideoDimensions(
          response.uploadedVideoUrl,
        );
        if (dimensions) {
          videoWidth = dimensions.width;
          videoHeight = dimensions.height;
        }
      } catch (error) {
        console.warn(
          `[KlingTextToVideoProcessor] Failed to get video dimensions:`,
          error?.message || error,
        );
      }

      const suggestedTags = await this.videoGenerationService.buildSuggestedTags(tag);
      const suggestedTagsForParams = suggestedTags.map((t) => ({
        id: t.id,
        name: t.name.replace('#', ''),
      }));

      let post = await this.videoGenerationService.createPostForVideo(
        response.uploadedVideoUrl,
        user,
        tag,
        dto,
        suggestedTagsForParams,
        videoWidth,
        videoHeight,
        dto.contest_id ?? null,
      );
      post = await this.videoGenerationService.getPostById(post.id);

      const videoCost = await this.videoGenerationService.updateUserCredits(
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
        await this.videoGenerationService.logActivityAndNotify(
          userId,
          ActivityEnum.VIDEO_GENERATE_SPEND,
          dto.ai_service,
          videoCost,
        );
      } catch {}

      console.log(
        `[KlingTextToVideoProcessor] Successfully generated video | Job: ${job.id} | User: ${userId} | Service: ${dto?.ai_service}`,
      );

      return {
        generatedVideo: response.uploadedVideoUrl,
        post,
        suggestedTags,
      };
    } catch (error) {
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    await this.handleCompletedNotification(job);
  }
}

