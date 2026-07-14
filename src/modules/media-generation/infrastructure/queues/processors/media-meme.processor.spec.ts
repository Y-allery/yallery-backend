import { MediaMemeProcessor } from './media-meme.processor';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';

describe('MediaMemeProcessor', () => {
  const createGateway = () =>
    ({
      sendMediaGenerationError: jest.fn(),
    }) as unknown as NotificationGateway;

  it('emits mediaGenerationError with meme type and refunds after final failed attempt', async () => {
    const notificationGateway = createGateway();
    const balanceService = { refund: jest.fn() };
    const processor = new MediaMemeProcessor(
      {} as any,
      notificationGateway,
      balanceService as any,
    );

    await processor.onFailed(
      {
        id: 'meme-job-1',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {
          userId: 77,
          aiService: 'wan22_animate_native',
          chargeId: 'charge-meme',
        },
      } as any,
      new Error('worker crashed'),
    );

    expect(balanceService.refund).toHaveBeenCalledWith('charge-meme');
    expect(notificationGateway.sendMediaGenerationError).toHaveBeenCalledWith(
      '77',
      {
        type: 'meme',
        message: 'Generation failed: worker crashed',
        jobId: 'meme-job-1',
        taskId: 'meme-job-1',
        aiService: 'wan22_animate_native',
      },
    );
  });
});
