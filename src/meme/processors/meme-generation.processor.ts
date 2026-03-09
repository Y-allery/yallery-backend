import { Processor, OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// replicate package exports the constructor as module.exports, not default
const Replicate = require('replicate');
import { ConfigService } from '@nestjs/config';
import { MemeEntity } from '../entities/meme.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { UploadService } from 'src/upload/upload.service';
import { UserService } from 'src/user/user.service';
import { MEME_GENERATION_QUEUE } from '../meme.constants';
import { PostEntity } from 'src/post/entities/post.entity';

const REPLICATE_MODEL = 'kwaivgi/kling-v2.6-motion-control';

/** Cloudinary: first frame of video as preview image URL */
function getPreviewUrlFromVideoUrl(videoUrl: string): string | null {
  if (!videoUrl || typeof videoUrl !== 'string') return null;
  if (!videoUrl.includes('cloudinary.com')) return null;
  const base = videoUrl.split('?')[0];
  if (base.includes('/video/upload/')) {
    const withFrame = base.replace('/video/upload/', '/video/upload/so_0/');
    if (/\.(mp4|webm|mov|avi)$/i.test(withFrame)) {
      return withFrame.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
    }
    return `${withFrame}.jpg`;
  }
  if (/\.(mp4|webm|mov|avi)$/i.test(base)) {
    return base.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
  }
  return `${base}.jpg`;
}

@Injectable()
@Processor(MEME_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 300000,
})
export class MemeGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(MemeGenerationProcessor.name);

  constructor(
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly uploadService: UploadService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{
    memeId: number;
    imageUrl: string;
    userId: number;
    prompt?: string;
    characterOrientation?: 'image' | 'video';
  }, any, string>): Promise<{
    videoUrl: string;
    post: PostEntity;
  }> {
    const { memeId, imageUrl, userId, prompt, characterOrientation } = job.data;
    const jobId = job.id ?? String(job.id);
    this.logger.log(`[${jobId}] Starting memeId=${memeId} userId=${userId}`);

    try {
      await this.notificationGateway.sendMemeGenerationProgress(
        String(userId),
        { jobId, status: 'started', message: 'Meme generation started' },
      );
      this.logger.log(`[${jobId}] Progress sent (started)`);

      const meme = await this.memeRepository.findOne({
        where: { id: memeId },
        relations: ['tag'],
      });
      if (!meme || !meme.referenceVideoUrl) {
        throw new Error('Meme not found or missing reference video');
      }
      if (!meme.tag) {
        throw new Error('Meme has no tag assigned');
      }
      this.logger.log(`[${jobId}] Meme found: ${meme.name}, tagId=${meme.tag?.id}`);

      const token = this.configService.get<string>('REPLICATE_API_TOKEN');
      if (!token) {
        throw new Error('REPLICATE_API_TOKEN is not set');
      }

      await this.notificationGateway.sendMemeGenerationProgress(
        String(userId),
        { jobId, status: 'processing', message: 'Running Kling motion control...' },
      );
      this.logger.log(`[${jobId}] Calling Replicate ${REPLICATE_MODEL}...`);

      const replicate = new Replicate({ auth: token });
      const output = await replicate.run(REPLICATE_MODEL, {
        input: {
          mode: 'std',
          image: imageUrl,
          video: meme.referenceVideoUrl,
          prompt: prompt?.trim() ?? '',
          keep_original_sound: true,
          character_orientation: characterOrientation ?? 'video',
        },
      }) as { url?: () => string } | string;

      let rawVideoUrl: string;
      if (typeof output === 'string') {
        rawVideoUrl = output;
      } else if (output && typeof (output as any).url === 'function') {
        rawVideoUrl = (output as any).url();
      } else if (output && typeof (output as any).url === 'string') {
        rawVideoUrl = (output as any).url;
      } else {
        throw new Error(`Replicate returned unexpected output: ${JSON.stringify(output)}`);
      }
      this.logger.log(`[${jobId}] Replicate done, rawVideoUrl length=${rawVideoUrl?.length ?? 0}`);

      const videoUrl = await this.uploadService.uploadVideoByUrl(rawVideoUrl);
      if (!videoUrl) {
        throw new Error('Failed to upload generated video to storage');
      }
      this.logger.log(`[${jobId}] Video uploaded to Cloudinary`);

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const tag = meme.tag;

      const previewImageUrl = getPreviewUrlFromVideoUrl(videoUrl) ?? meme.referenceImageUrl ?? imageUrl;
      const suggestedTagsForParams = tag
        ? [{ id: tag.id, name: '#' + tag.name, imageUrl: tag.imageUrl }]
        : [];
      const post = this.postRepository.create({
        user: { id: user.id },
        tag,
        videoUrl,
        imageUrl: null,
        previewImageUrl,
        hasAudio: true,
        isPublished: false,
        isSaved: true,
        isDelivered: false,
        generationParams: {
          memeId,
          sourceImageUrl: imageUrl,
          memeName: meme.name,
          suggestedTags: suggestedTagsForParams,
        },
      });
      const savedPost = await this.postRepository.save(post);

      await this.notificationGateway.sendMemeGenerated(String(userId), {
        id: savedPost.id,
        videoUrl: savedPost.videoUrl,
        previewImageUrl: savedPost.previewImageUrl ?? null,
        generationParams: {
          memeId,
          sourceImageUrl: imageUrl,
          memeName: meme.name,
          suggestedTags: suggestedTagsForParams,
        },
        publishTo: { postToTwitter: false, postToInstagram: false },
      });
      this.logger.log(`[${jobId}] Done: postId=${savedPost.id}`);

      return { videoUrl, post: savedPost };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.error(`[${jobId}] Failed: ${message}`, err?.stack);
      await this.notificationGateway.sendMemeGenerationFailed(String(userId), {
        jobId,
        error: message,
      });
      throw err;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`[${job.id}] Job active (worker picked up)`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    const { userId } = job.data ?? {};
    const jobId = job.id ?? String(job.id);
    this.logger.error(`[${jobId}] Job failed: ${err.message}`, err.stack);

    if (!userId) return;

    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    try {
      if (attemptsMade >= maxAttempts) {
        await this.notificationGateway.sendMemeGenerationFailed(String(userId), {
          jobId,
          error: err.message,
        });
      } else if (job.finishedOn && job.processedOn) {
        const jobState = await job.getState().catch(() => null);
        if (jobState === 'failed') {
          await this.notificationGateway.sendMemeGenerationFailed(String(userId), {
            jobId,
            error: err.message,
          });
        }
      }
    } catch (e) {
      this.logger.error(`[${jobId}] onFailed notify error`, e);
    }
  }
}
