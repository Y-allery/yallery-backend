import { ContestTypeEnum } from 'src/modules/contests/types/contest.status.enum';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { USER_READ_STATE_KINDS } from '../types/user-read-state.constants';
import { UserActivityQueryService } from './user-activity-query.service';
import { UserReadStateService } from './user-read-state.service';

describe('UserReadStateService', () => {
  const createService = () => {
    const userActivityQueryService = {
      markFeedAsRead: jest.fn().mockResolvedValue(3),
      markContestActivitiesAsReadByType: jest.fn().mockResolvedValue(2),
    } as unknown as jest.Mocked<UserActivityQueryService>;

    const postRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as any;

    const viewedPostRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as any;

    const notificationGateway = {
      emitProfileUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationGateway>;

    const service = new UserReadStateService(
      userActivityQueryService,
      postRepository,
      viewedPostRepository,
      notificationGateway,
    );

    return {
      service,
      userActivityQueryService,
      postRepository,
      notificationGateway,
    };
  };

  it('emits profileUpdate after marking activity feed as read', async () => {
    const { service, notificationGateway } = createService();

    await expect(
      service.markReadState(42, { kind: USER_READ_STATE_KINDS.FEED }),
    ).resolves.toEqual({
      status: 'success',
      kind: USER_READ_STATE_KINDS.FEED,
      message: 'Activity feed marked as read',
      markedCount: 3,
    });

    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('42');
  });

  it('emits profileUpdate after marking contest activities as read', async () => {
    const { service, userActivityQueryService, notificationGateway } =
      createService();

    await service.markReadState(42, {
      kind: USER_READ_STATE_KINDS.FINE_TUNE_CONTESTS,
    });

    expect(
      userActivityQueryService.markContestActivitiesAsReadByType,
    ).toHaveBeenCalledWith(42, ContestTypeEnum.FINE_TUNE);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('42');
  });

  it('emits profileUpdate after marking stories as viewed', async () => {
    const { service, postRepository, notificationGateway } = createService();

    await expect(
      service.markReadState(42, {
        kind: USER_READ_STATE_KINDS.STORIES,
        post_ids: [10, 11],
      }),
    ).resolves.toEqual({
      status: 'success',
      kind: USER_READ_STATE_KINDS.STORIES,
      message: 'Stories marked as read',
      markedCount: 0,
      notFoundIds: [10, 11],
    });

    expect(postRepository.find).toHaveBeenCalled();
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('42');
  });
});
