import { Processor, OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Replicate from 'replicate';
import { ConfigService } from '@nestjs/config';
import { MemeEntity } from '../entities/meme.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { UploadService } from 'src/upload/upload.service';
import { UserService } from 'src/user/user.service';
import { MEME_GENERATION_QUEUE } from '../meme.constants';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';

const REPLICATE_MODEL = 'kwaivgi/kling-v2.6-motion-control';

@Injectable()
@Processor(MEME_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 300000,
})
export class MemeGenerationProcessor extends WorkerHost {
  constructor(
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly uploadService: UploadService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ memeId: number; imageUrl: string; userId: number }, any, string>): Promise<{
    videoUrl: string;
    post: PostEntity;
  }> {
    const { memeId, imageUrl, userId } = job.data;
    const jobId = job.id ?? String(job.id);

    try {
      await this.notificationGateway.sendMemeGenerationProgress(
        String(userId),
        { jobId, status: 'started', message: 'Meme generation started' },
      );

      const meme = await this.memeRepository.findOne({ where: { id: memeId } });
      if (!meme || !meme.referenceVideoUrl) {
        throw new Error('Meme not found or missing reference video');
      }

      const token = this.configService.get<string>('REPLICATE_API_TOKEN');
      if (!token) {
        throw new Error('REPLICATE_API_TOKEN is not set');
      }

      await this.notificationGateway.sendMemeGenerationProgress(
        String(userId),
        { jobId, status: 'processing', message: 'Running Kling motion control...' },
      );

      const replicate = new Replicate({ auth: token });
      const output = await replicate.run(REPLICATE_MODEL, {
        input: {
          mode: 'pro',
          image: imageUrl,
          video: meme.referenceVideoUrl,
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

      const videoUrl = await this.uploadService.uploadVideoByUrl(rawVideoUrl);
      if (!videoUrl) {
        throw new Error('Failed to upload generated video to storage');
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const defaultTag = await this.tagRepository.findOne({
        where: { name: 'other' },
      }).then((t) => t ?? this.tagRepository.find().then((tags) => tags[0]));
      if (!defaultTag) {
        throw new Error('No tag found for meme post');
      }

      const previewImageUrl = meme.referenceImageUrl ?? imageUrl;
      const post = this.postRepository.create({
        user: { id: user.id },
        tag: defaultTag,
        videoUrl,
        imageUrl: null,
        previewImageUrl,
        isPublished: false,
        isSaved: true,
        isDelivered: false,
        generationParams: {
          memeId,
          sourceImageUrl: imageUrl,
          memeName: meme.name,
        },
      });
      const savedPost = await this.postRepository.save(post);

      await this.notificationGateway.sendMemeGenerated(String(userId), {
        jobId,
        postId: savedPost.id,
        videoUrl: savedPost.videoUrl,
        previewImageUrl: savedPost.previewImageUrl,
      });

      return { videoUrl, post: savedPost };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await this.notificationGateway.sendMemeGenerationFailed(String(userId), {
        jobId,
        error: message,
      });
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    const { userId } = job.data ?? {};
    const jobId = job.id ?? String(job.id);
    if (userId) {
      try {
        await this.notificationGateway.sendMemeGenerationFailed(String(userId), {
          jobId,
          error: err.message,
        });
      } catch (e) {
        console.error('[MemeGenerationProcessor] onFailed notify error:', e);
      }
    }
  }
}
