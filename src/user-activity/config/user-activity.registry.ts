import {
  USER_ACTIVITY_CATEGORIES,
  USER_ACTIVITY_TYPES,
  UserActivityCategory,
  UserActivityType,
} from '../types/user-activity.constants';

type UserActivityDescriptor = {
  key: UserActivityType;
  category: UserActivityCategory;
  name: string;
  description: string;
  buildDescription: (
    payload: Record<string, any> | null | undefined,
    pointsDelta: number,
  ) => string;
};

const formatPoints = (pointsDelta: number) => Math.abs(Number(pointsDelta || 0));

export const USER_ACTIVITY_REGISTRY: Record<
  UserActivityType,
  UserActivityDescriptor
> = {
  [USER_ACTIVITY_TYPES.LIKE_RECEIVED]: {
    key: USER_ACTIVITY_TYPES.LIKE_RECEIVED,
    category: USER_ACTIVITY_CATEGORIES.SOCIAL,
    name: 'Like Received',
    description: 'User received a like on a post.',
    buildDescription: (_payload, pointsDelta) =>
      `You earned ${formatPoints(pointsDelta)} YEPs for a like`,
  },
  [USER_ACTIVITY_TYPES.LIKE_SPENT]: {
    key: USER_ACTIVITY_TYPES.LIKE_SPENT,
    category: USER_ACTIVITY_CATEGORIES.SOCIAL,
    name: 'Like Spent',
    description: 'User spent credits to like a post.',
    buildDescription: (_payload, pointsDelta) =>
      `You spent ${formatPoints(pointsDelta)} YEPs on a like`,
  },
  [USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT]: {
    key: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
    category: USER_ACTIVITY_CATEGORIES.GENERATION,
    name: 'Media Generation Spent',
    description: 'User spent credits on image, video, or audio generation.',
    buildDescription: (payload, pointsDelta) => {
      const mediaType = String(payload?.mediaType ?? 'media');
      const mode = String(payload?.mode ?? 'generation').replace(/_/g, ' ');
      return `You spent ${formatPoints(pointsDelta)} YEPs on ${mediaType} ${mode}`;
    },
  },
  [USER_ACTIVITY_TYPES.CONTEST_OPENED]: {
    key: USER_ACTIVITY_TYPES.CONTEST_OPENED,
    category: USER_ACTIVITY_CATEGORIES.CONTEST,
    name: 'Contest Opened',
    description: 'A contest opened and became available to the user.',
    buildDescription: (payload) =>
      `The contest ${payload?.contestName ?? 'contest'} is now open! Join us for an exciting challenge and show off your skills.`,
  },
  [USER_ACTIVITY_TYPES.CONTEST_WON]: {
    key: USER_ACTIVITY_TYPES.CONTEST_WON,
    category: USER_ACTIVITY_CATEGORIES.CONTEST,
    name: 'Contest Won',
    description: 'User won a contest.',
    buildDescription: (payload, pointsDelta) =>
      `Congratulations! You won first place in the ${payload?.contestName ?? 'contest'} contest and received a reward of ${formatPoints(pointsDelta)} YEPs`,
  },
};

export const getUserActivityDescriptor = (
  type: UserActivityType,
): UserActivityDescriptor => {
  return USER_ACTIVITY_REGISTRY[type];
};

export const listUserActivityDescriptors = (): UserActivityDescriptor[] => {
  return Object.values(USER_ACTIVITY_REGISTRY);
};
