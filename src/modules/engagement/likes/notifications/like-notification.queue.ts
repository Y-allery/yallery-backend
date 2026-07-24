export const LIKE_NOTIFICATIONS_QUEUE = 'like_notifications';

export const LIKE_NOTIFICATIONS_JOB_NAME = 'like_notification';

export type LikeNotificationJobData = {
  /** Author of the liked post — receives LIKE_EARN. */
  postOwnerId: number;
  /** User who liked — receives LIKE_SPEND. */
  likerId: number;
  postId: number;
};
