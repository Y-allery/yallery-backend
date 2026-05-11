import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';

export function getNotificationMessage(
  activityType: UserNotificationTypeEnum,
): {
  title: string;
  body: string;
} {
  switch (activityType) {
    case UserNotificationTypeEnum.LIKE_EARN:
      return {
        title: 'You earned a like!',
        body: 'You received a like and earned points!',
      };
    case UserNotificationTypeEnum.LIKE_SPEND:
      return {
        title: 'You spent points on a like!',
        body: 'You’ve spent points to like this post.',
      };
    case UserNotificationTypeEnum.CONTEST_WIN:
      return {
        title: 'Congratulations!',
        body: 'You won first place in the contest and received a reward of points.',
      };
    case UserNotificationTypeEnum.DAILY_REWARD:
      return {
        title: 'Daily Login',
        body: 'You received points for daily login.',
      };
    case UserNotificationTypeEnum.SHARE_REWARD:
      return {
        title: 'Share Reward',
        body: 'You received a reward for sharing content.',
      };
    default:
      return {
        title: 'Notification',
        body: 'You have a new notification.',
      };
  }
}
