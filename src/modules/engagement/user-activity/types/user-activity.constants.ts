export const USER_ACTIVITY_TYPES = {
  LIKE_RECEIVED: 'like_received',
  LIKE_SPENT: 'like_spent',
  MEDIA_GENERATION_SPENT: 'media_generation_spent',
  CONTEST_OPENED: 'contest_opened',
  CONTEST_WON: 'contest_won',
} as const;

export type UserActivityType =
  (typeof USER_ACTIVITY_TYPES)[keyof typeof USER_ACTIVITY_TYPES];

export const USER_ACTIVITY_CATEGORIES = {
  SOCIAL: 'social',
  GENERATION: 'generation',
  CONTEST: 'contest',
} as const;

export type UserActivityCategory =
  (typeof USER_ACTIVITY_CATEGORIES)[keyof typeof USER_ACTIVITY_CATEGORIES];

export const USER_ACTIVITY_FILTERS = {
  ALL: 'all',
  EARNED: 'earned',
  SPENT: 'spent',
} as const;

export type UserActivityFilter =
  (typeof USER_ACTIVITY_FILTERS)[keyof typeof USER_ACTIVITY_FILTERS];

export const USER_ACTIVITY_PERIODS = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
} as const;

export type UserActivityPeriod =
  (typeof USER_ACTIVITY_PERIODS)[keyof typeof USER_ACTIVITY_PERIODS];
