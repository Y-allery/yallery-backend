import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PostService } from 'src/post/post.service';

@Injectable()
@Processor('tweet-queue', {
  concurrency: 1,
  limiter: {
    max: 4,
    duration: 60000,
  },
})
export class TweetProcessor extends WorkerHost {
  constructor(private readonly postService: PostService) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { postId, userId } = job.data;
    try {
      return await this.postService.tweetImageViaPuppeteer(postId, userId);
    } catch (err) {
      if (job.attemptsMade < (job.opts.attempts || 1) - 1) {
        throw err;
      } else {
        console.error(
          `Tweet job ${job.id} failed after ${job.attemptsMade + 1} attempts: ${err.message}`,
        );
        return;
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`Tweet job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    console.error(`Tweet job ${job.id} failed: ${err.message}`);
  }
}
