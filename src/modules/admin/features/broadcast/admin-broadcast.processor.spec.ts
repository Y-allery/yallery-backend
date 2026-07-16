import { NotificationType } from 'src/modules/admin/dto/broadcast-notification.dto';
import { AdminBroadcastProcessor } from './admin-broadcast.processor';

describe('AdminBroadcastProcessor', () => {
  const createProcessor = () => {
    const userRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const deviceTokenRepository = {
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const firebaseService = {
      sendNotification: jest.fn().mockResolvedValue({ success: true }),
    };
    const mailService = {
      sendBroadcastEmail: jest.fn().mockResolvedValue(undefined),
    };
    return {
      processor: new AdminBroadcastProcessor(
        userRepository as any,
        deviceTokenRepository as any,
        firebaseService as any,
        mailService as any,
      ),
      userRepository,
      deviceTokenRepository,
      firebaseService,
      mailService,
    };
  };

  const createJob = (data: Record<string, any>) => ({
    data,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  });

  it('paginates with keyset (id > lastId) and processes every page', async () => {
    const { processor, userRepository, mailService } = createProcessor();
    userRepository.find
      .mockResolvedValueOnce([
        { id: 1, email: 'a@x.com' },
        { id: 2, email: 'b@x.com' },
      ])
      .mockResolvedValueOnce([{ id: 3, email: 'c@x.com' }])
      .mockResolvedValue([]);
    const job = createJob({
      type: NotificationType.EMAIL,
      title: 'Title',
      body: 'Body',
    });

    const result = await processor.process(job as any);

    expect(userRepository.find).toHaveBeenCalledTimes(3);
    const whereIds = userRepository.find.mock.calls.map(
      ([options]) => options.where.id.value,
    );
    expect(whereIds).toEqual([0, 2, 3]);
    expect(userRepository.find.mock.calls[0][0]).toMatchObject({
      order: { id: 'ASC' },
      take: 100,
    });
    // emailSubject omitted -> falls back to title
    expect(mailService.sendBroadcastEmail).toHaveBeenCalledTimes(3);
    expect(mailService.sendBroadcastEmail).toHaveBeenCalledWith(
      'a@x.com',
      'Title',
      'Body',
    );
    expect(job.updateProgress).toHaveBeenLastCalledWith(3);
    expect(result).toMatchObject({
      success: true,
      totalProcessed: 3,
      totalSuccess: 3,
      totalErrors: 0,
    });
  });

  it('logs and skips per-user email failures without aborting the run', async () => {
    const { processor, userRepository, mailService } = createProcessor();
    userRepository.find
      .mockResolvedValueOnce([
        { id: 1, email: 'a@x.com' },
        { id: 2, email: 'b@x.com' },
      ])
      .mockResolvedValue([]);
    mailService.sendBroadcastEmail
      .mockRejectedValueOnce(new Error('smtp error'))
      .mockResolvedValue(undefined);
    const job = createJob({
      type: NotificationType.EMAIL,
      title: 'Title',
      body: 'Body',
      emailSubject: 'Subject',
    });

    const result = await processor.process(job as any);

    expect(mailService.sendBroadcastEmail).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      success: true,
      totalProcessed: 2,
      totalSuccess: 1,
      totalErrors: 1,
    });
  });

  it('removes invalid device tokens and still counts the user as processed', async () => {
    const { processor, userRepository, firebaseService, deviceTokenRepository } =
      createProcessor();
    const invalidToken = { token: 'bad' };
    const validToken = { token: 'good' };
    userRepository.find
      .mockResolvedValueOnce([
        { id: 1, deviceTokens: [invalidToken, validToken] },
      ])
      .mockResolvedValue([]);
    firebaseService.sendNotification.mockImplementation(async (token) =>
      token === 'bad'
        ? { success: false, isInvalidToken: true }
        : { success: true },
    );
    const job = createJob({
      type: NotificationType.PUSH,
      title: 'Title',
      body: 'Body',
    });

    const result = await processor.process(job as any);

    expect(firebaseService.sendNotification).toHaveBeenCalledTimes(2);
    expect(deviceTokenRepository.remove).toHaveBeenCalledWith(invalidToken);
    expect(result).toMatchObject({
      totalProcessed: 1,
      totalSuccess: 1,
      totalErrors: 0,
    });
  });
});
