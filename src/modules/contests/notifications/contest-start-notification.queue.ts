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
  /**
   * Sweep checkpoint, persisted via job.updateData after each user batch so a
   * worker restart (deploys!) resumes where it stopped instead of starting
   * over — or worse, never finishing the tail.
   */
  lastUserId?: number;
};
