import { BaseMediaProcessor } from './base-media.processor';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';

class TestMediaProcessor extends BaseMediaProcessor {
  constructor(notificationGateway: NotificationGateway) {
    super(notificationGateway, 'image_edit');
  }

  async process() {
    return null;
  }

  fail(job: any, err: Error, messagePrefix = 'Generation failed') {
    return this.handleFailedGeneration(job, err, messagePrefix);
  }
}

describe('BaseMediaProcessor', () => {
  const createGateway = () =>
    ({
      sendMediaGenerationError: jest.fn(),
    }) as unknown as NotificationGateway;

  it('emits mediaGenerationError after final failed attempt', async () => {
    const notificationGateway = createGateway();
    const processor = new TestMediaProcessor(notificationGateway);

    await processor.fail(
      {
        id: 'job-123',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {
          userId: 42,
          aiService: 'qwen_image_edit_baked',
        },
      },
      new Error('RunPod failed'),
    );

    expect(notificationGateway.sendMediaGenerationError).toHaveBeenCalledWith(
      '42',
      {
        type: 'image_edit',
        message: 'Generation failed: RunPod failed',
        jobId: 'job-123',
        aiService: 'qwen_image_edit_baked',
      },
    );
  });

  it('does not emit before retry attempts are exhausted', async () => {
    const notificationGateway = createGateway();
    const processor = new TestMediaProcessor(notificationGateway);

    await processor.fail(
      {
        id: 'job-123',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: {
          userId: 42,
          aiService: 'qwen_image_edit_baked',
        },
      },
      new Error('temporary failure'),
    );

    expect(notificationGateway.sendMediaGenerationError).not.toHaveBeenCalled();
  });
});
