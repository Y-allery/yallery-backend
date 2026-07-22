import { BaseMediaProcessor } from './base-media.processor';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { OpsBotService } from 'src/modules/ops-bot/ops-bot.service';

class TestMediaProcessor extends BaseMediaProcessor {
  constructor(
    notificationGateway: NotificationGateway,
    balanceService: MediaGenerationBalanceService,
    opsBotService: OpsBotService,
  ) {
    super(notificationGateway, 'image_edit', balanceService, opsBotService);
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

  const createBalanceService = () =>
    ({
      refund: jest.fn(),
    }) as unknown as MediaGenerationBalanceService;

  const createOpsBot = () =>
    ({
      notifyRunpodFailure: jest.fn(async () => {}),
    }) as unknown as OpsBotService;

  it('emits mediaGenerationError and refunds the charge after final failed attempt', async () => {
    const notificationGateway = createGateway();
    const balanceService = createBalanceService();
    const processor = new TestMediaProcessor(
      notificationGateway,
      balanceService,
      createOpsBot(),
    );

    await processor.fail(
      {
        id: 'job-123',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {
          userId: 42,
          aiService: 'qwen_image_edit_baked',
          chargeId: 'charge-abc',
        },
      },
      new Error('RunPod failed'),
    );

    expect(balanceService.refund).toHaveBeenCalledWith('charge-abc');
    expect(notificationGateway.sendMediaGenerationError).toHaveBeenCalledWith(
      '42',
      {
        type: 'image_edit',
        message: 'Generation failed: RunPod failed',
        jobId: 'job-123',
        taskId: 'job-123',
        aiService: 'qwen_image_edit_baked',
      },
    );
  });

  it('does not emit or refund before retry attempts are exhausted', async () => {
    const notificationGateway = createGateway();
    const balanceService = createBalanceService();
    const processor = new TestMediaProcessor(
      notificationGateway,
      balanceService,
      createOpsBot(),
    );

    await processor.fail(
      {
        id: 'job-123',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: {
          userId: 42,
          aiService: 'qwen_image_edit_baked',
          chargeId: 'charge-abc',
        },
      },
      new Error('temporary failure'),
    );

    expect(balanceService.refund).not.toHaveBeenCalled();
    expect(notificationGateway.sendMediaGenerationError).not.toHaveBeenCalled();
  });
});
