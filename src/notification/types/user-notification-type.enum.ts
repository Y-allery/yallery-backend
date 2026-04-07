export enum UserNotificationTypeEnum {
  LIKE_EARN = 'LIKE_EARN',
  LIKE_SPEND = 'LIKE_SPEND',
  CONTEST_WIN = 'CONTEST_WIN',
  DAILY_REWARD = 'DAILY_REWARD',
  SHARE_REWARD = 'SHARE_REWARD',
}

export const USER_NOTIFICATION_PREFERENCE_TYPES = [
  UserNotificationTypeEnum.LIKE_EARN,
  UserNotificationTypeEnum.LIKE_SPEND,
] as const;
