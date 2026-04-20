import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(TweetProcessor.name);

  constructor(private readonly postService: PostService) {
    super();
  }

  async process(job: Job<any, any, string>) {
    const { postId, userId } = job.data;
    this.logger.log(
      `[tweet] processing-started | jobId=${job.id} | userId=${userId} | postId=${postId} | attempt=${job.attemptsMade + 1}/${job.opts.attempts || 1}`,
    );

    try {
      const result = await this.postService.tweetImageViaPuppeteer(postId, userId);
      this.logger.log(
        `[tweet] processing-finished | jobId=${job.id} | userId=${userId} | postId=${postId} | tweetUrl=${result.tweetUrl || 'n/a'} | message="${result.message}"`,
      );
      return result;
    } catch (err) {
      if (job.attemptsMade < (job.opts.attempts || 1) - 1) {
        this.logger.warn(
          `[tweet] processing-retry | jobId=${job.id} | userId=${userId} | postId=${postId} | nextAttempt=${job.attemptsMade + 2}/${job.opts.attempts || 1} | error="${err.message}"`,
        );
        throw err;
      } else {
        this.logger.error(
          `[tweet] processing-failed-final | jobId=${job.id} | userId=${userId} | postId=${postId} | attempts=${job.attemptsMade + 1} | error="${err.message}"`,
        );
        return;
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[tweet] worker-completed | jobId=${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `[tweet] worker-failed | jobId=${job.id} | error="${err.message}"`,
    );
  }
}
