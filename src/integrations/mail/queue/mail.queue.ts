export const MAIL_QUEUE = 'mail';

export const MAIL_JOB_NAMES = {
  EMAIL_VERIFICATION: 'email_verification',
} as const;

export interface EmailVerificationJobData {
  userId: number;
  email: string;
  subject: string;
  /** Already contains the verification token persisted on the user row. */
  verifyUrl: string;
}
