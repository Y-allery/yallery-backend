export const USER_READ_STATE_KINDS = {
  FEED: 'feed',
  REGULAR_CONTESTS: 'regular_contests',
  FINE_TUNE_CONTESTS: 'fine_tune_contests',
  STORIES: 'stories',
} as const;

export type UserReadStateKind =
  (typeof USER_READ_STATE_KINDS)[keyof typeof USER_READ_STATE_KINDS];
