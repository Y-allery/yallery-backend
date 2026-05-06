import { UserService } from './../../user/user.service';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { VideoAIEnum } from 'src/common/enums/ai.enum';
import { VideoGenerationService } from '../video-generation.service';
import { BaseVideoProcessor } from './base-video-processor';
import { ContestEntity } from 'src/contest/entity/contest.entity';

@Injectable()
@Processor(VideoAIEnum.BYTY_DANCE, {
  concurrency: 60,
  lockDuration: 180000,
})
export class BytyDanceProcessor extends BaseVideoProcessor {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
    private readonly userService: UserService,
    notificationGateway: NotificationGateway,
    @InjectRepository(ContestEntity)
    contestRepository: Repository<ContestEntity>,
  ) {
    super(notificationGateway, contestRepository);
  }

  async process(job: Job<any, any, string>) {
    const { dto, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for video generation');
    }

    const prompt = dto?.prompt || 'N/A';
    console.log(`[BytyDanceProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${dto?.ai_service} | Prompt: ${prompt.substring(0, 50)}...`);

    try {
      const response = await this.videoGenerationService.generateVideo(dto);

      if (!response.uploadedVideoUrl) {
        throw new Error(
          `Video generation failed: no video URL returned. Response: ${JSON.stringify(response)}`,
        );
      }

      let findRelatedTag;
      try {
        findRelatedTag = await this.videoGenerationService.findBestTagByImage(
          dto.image_url,
        );
      } catch (aiError) {
        console.warn(
          `[BytyDanceProcessor] AI tag generation failed for user ${userId}, will use default tag:`,
          aiError.message,
        );
        findRelatedTag = await this.videoGenerationService.getDefaultTag();
      }

      if (!findRelatedTag) {
        throw new Error('Failed to determine tag for video');
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new Error(`User with id ${userId} not found`);
      }

      // Get video dimensions from Cloudinary
      let videoWidth: number | undefined = undefined;
      let videoHeight: number | undefined = undefined;
      try {
        const dimensions = await this.videoGenerationService.getVideoDimensions(response.uploadedVideoUrl);
        if (dimensions) {
          videoWidth = dimensions.width;
          videoHeight = dimensions.height;
        }
      } catch (error) {
        console.warn(`[BytyDanceProcessor] Failed to get video dimensions:`, error?.message || error);
      }

      // Build suggestedTags before creating post
      const suggestedTags = await this.videoGenerationService.buildSuggestedTags(findRelatedTag);
      // Convert to format without imageUrl for generation_params
      const suggestedTagsForParams = suggestedTags.map(tag => ({
        id: tag.id,
        name: tag.name.replace('#', ''), // Remove # prefix for storage
      }));

      let post;
      try {
        post = await this.videoGenerationService.createPostForVideo(
          response.uploadedVideoUrl,
          user,
          findRelatedTag,
          dto,
          suggestedTagsForParams,
          videoWidth,
          videoHeight,
          dto.contest_id ?? null,
        );
        // Reload post to get full generation_params
        post = await this.videoGenerationService.getPostById(post.id);
      } catch (error) {
        console.error(`[BytyDanceProcessor] Failed to create post for user ${userId}:`, error);
        throw new Error(`Failed to create post: ${error.message}`);
      }

      if (!post || !post.id) {
        throw new Error('Post creation failed: post is missing or has no id');
      }

      let videoCost: number;
      try {
        videoCost = await this.videoGenerationService.updateUserCredits(
          user,
          dto.ai_service,
          dto.duration,
        );
      } catch (error) {
        console.error(`[BytyDanceProcessor] Failed to update credits for user ${userId}:`, error);
        throw new Error(`Failed to update user credits: ${error.message}`);
      }

      try {
        await this.userService.sendPushNotificationIfEnabled(
          userId,
          ActivityEnum.VIDEO_GENERATE_SPEND,
        );
      } catch (error) {
        console.error(`[BytyDanceProcessor] Failed to send push notification for user ${userId}:`, error);
      }

      try {
        await this.videoGenerationService.logActivityAndNotify(
          userId,
          ActivityEnum.VIDEO_GENERATE_SPEND,
          dto.ai_service,
          videoCost,
        );
      } catch (error) {
        console.error(`[BytyDanceProcessor] Failed to log activity for user ${userId}:`, error);
      }

      console.log(`[BytyDanceProcessor] Successfully generated video | Job: ${job.id} | User: ${userId} | Service: ${dto?.ai_service}`);
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
