import { ActivityEnum } from 'src/activity/types/activity.enum';

export function getNotificationMessage(activityType: ActivityEnum): {
  title: string;
  body: string;
} {
  switch (activityType) {
    case ActivityEnum.LIKE_EARN:
      return {
        title: 'You earned a like!',
        body: 'You received a like and earned points!',
      };
    case ActivityEnum.LIKE_SPEND:
      return {
        title: 'You spent points on a like!',
        body: 'You’ve spent points to like this post.',
      };
    case ActivityEnum.IMAGE_GENERATE_SPEND:
      return {
        title: 'Image Generated!',
        body: 'You have successfully generated an image.',
      };
    case ActivityEnum.VIDEO_GENERATE_SPEND:
      return {
        title: 'Video Generated!',
        body: 'You have successfully generated a video.',
      };
    case ActivityEnum.CONTEST_CLOSE:
      return {
        title: 'Contest Closed',
        body: "The contest is closed. Unfortunately, you didn't win a prize this time.",
      };
    case ActivityEnum.CONTEST_WIN:
      return {
        title: 'Congratulations!',
        body: 'You won first place in the contest and received a reward of points.',
      };
    case ActivityEnum.DAILY_REWARD:
      return {
        title: 'Daily Login',
        body: 'You received points for daily login.',
      };
    case ActivityEnum.SHARE_REWARD:
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
