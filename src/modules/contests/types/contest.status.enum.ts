export enum ContestStatusEnum {
  /** Scheduled: visible in the app with "starts soon", joining not yet open. */
  UPCOMING = 'upcoming',
  OPEN = 'open',
  /** Ended, waiting for winner review. */
  PENDING_REVIEW = 'pending_review',
  /** Finished (winner approved or no submissions). */
  CLOSED = 'closed',
}

export enum ContestTypeEnum {
  DEFAULT = 'DEFAULT',
  FINE_TUNE = 'FINE_TUNE',
}
