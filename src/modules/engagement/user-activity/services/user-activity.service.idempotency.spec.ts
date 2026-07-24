import { USER_ACTIVITY_TYPES } from '../types/user-activity.constants';
import { UserActivityService } from './user-activity.service';

function createService() {
  const repository = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 123, ...value })),
  };
  return {
    service: new UserActivityService(repository as any),
    repository,
  };
}

describe('UserActivityService idempotency', () => {
  it('adopts an existing activity without writing again', async () => {
    const { service, repository } = createService();
    const existing = {
      id: 321,
      idempotencyKey: 'media_generation:task_12345678',
    };
    repository.findOne.mockResolvedValueOnce(existing);

    await expect(
      service.createActivityOnce({
        idempotencyKey: 'media_generation:task_12345678',
        userId: 55,
        type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
      }),
    ).resolves.toBe(existing);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('adopts the concurrent winner after a unique-key collision', async () => {
    const { service, repository } = createService();
    const existing = {
      id: 321,
      idempotencyKey: 'media_generation:task_12345678',
    };
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    repository.save.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });

    await expect(
      service.createActivityOnce({
        idempotencyKey: 'media_generation:task_12345678',
        userId: 55,
        type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
      }),
    ).resolves.toBe(existing);

    expect(repository.findOne).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('uses a task-scoped key for cascade generation spend', async () => {
    const { service, repository } = createService();

    await service.logMediaGenerationSpentOnce('task_12345678', {
      userId: 55,
      pointsDelta: -25,
      mediaType: 'video',
      mode: 'text_to_video',
      aiService: 'p_video_text',
      duration: 5,
      postId: 12,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'media_generation:task_12345678',
        user: { id: 55 },
        type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
        pointsDelta: -25,
        post: { id: 12 },
        payload: expect.objectContaining({
          mediaType: 'video',
          mode: 'text_to_video',
          duration: 5,
        }),
      }),
    );
  });
});
