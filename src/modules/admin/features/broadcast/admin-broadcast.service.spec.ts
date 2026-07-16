import { NotificationType } from 'src/modules/admin/dto/broadcast-notification.dto';
import { AdminBroadcastService } from './admin-broadcast.service';

describe('AdminBroadcastService', () => {
  const createService = () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: '42' }),
    };
    return { service: new AdminBroadcastService(queue as any), queue };
  };

  it('enqueues one job with the payload and returns an acknowledgement', async () => {
    const { service, queue } = createService();

    const result = await service.broadcastNotification({
      type: NotificationType.PUSH,
      title: 'Hello',
      body: 'World',
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'broadcast',
      {
        type: NotificationType.PUSH,
        title: 'Hello',
        body: 'World',
        emailSubject: undefined,
      },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );
    expect(result).toEqual({
      success: true,
      type: NotificationType.PUSH,
      jobId: '42',
      message: 'push notification broadcast queued',
    });
  });

  it('passes the email subject through to the job payload', async () => {
    const { service, queue } = createService();

    await service.broadcastNotification({
      type: NotificationType.EMAIL,
      title: 'Hello',
      body: 'World',
      emailSubject: 'Custom subject',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'broadcast',
      expect.objectContaining({ emailSubject: 'Custom subject' }),
      expect.any(Object),
    );
  });

  it('propagates enqueue failures so the admin sees an error', async () => {
    const { service, queue } = createService();
    queue.add.mockRejectedValue(new Error('redis down'));

    await expect(
      service.broadcastNotification({
        type: NotificationType.PUSH,
        title: 'Hello',
        body: 'World',
      }),
    ).rejects.toThrow('redis down');
  });
});
