export const CONTEST_START_NOTIFICATIONS_QUEUE =
  'contest_start_notifications';

export const CONTEST_START_NOTIFICATIONS_JOB_NAME =
  'contest_start_notifications';

export type ContestStartNotificationJobData = {
  contestId: number;
  contestName: string;
  contestType: string;
  previewUrl: string | null;
  title: string;
  body: string;
};
