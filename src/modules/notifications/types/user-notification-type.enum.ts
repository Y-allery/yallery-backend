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

/**
 * Value used when the user has no `notification_preferences` row for a type.
 * Rows are written only when the user touches the toggle, so the missing-row
 * case is the common one and it — not the entity column default — decides
 * whether a push goes out.
 *
 * LIKE_EARN is opt-out: "someone liked your post, +N points" is the main
 * re-engagement push and was effectively dark for everyone. LIKE_SPEND stays
 * opt-in because it reports the user's own spend back to them, which is noise.
 */
export const DEFAULT_NOTIFICATION_PREFERENCE_ENABLED: Readonly<
  Record<UserNotificationTypeEnum, boolean>
> = {
  [UserNotificationTypeEnum.LIKE_EARN]: true,
  [UserNotificationTypeEnum.LIKE_SPEND]: false,
  [UserNotificationTypeEnum.CONTEST_WIN]: true,
  [UserNotificationTypeEnum.DAILY_REWARD]: true,
  [UserNotificationTypeEnum.SHARE_REWARD]: true,
};

export const isNotificationEnabledByDefault = (
  activityType: UserNotificationTypeEnum,
): boolean => DEFAULT_NOTIFICATION_PREFERENCE_ENABLED[activityType] ?? true;

/** Types whose push delivery is gated on the per-type preference. */
export const isPreferenceGatedNotification = (
  activityType: UserNotificationTypeEnum,
): boolean =>
  (
    USER_NOTIFICATION_PREFERENCE_TYPES as readonly UserNotificationTypeEnum[]
  ).includes(activityType);
