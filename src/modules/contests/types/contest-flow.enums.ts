export enum ContestFlowVersion {
  V2 = 'v2',
}

export enum ContestLifecycleStatus {
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  REVIEWING = 'reviewing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ContestReviewStatus {
  NONE = 'none',
  CANDIDATES_READY = 'candidates_ready',
  NEEDS_MANUAL_REVIEW = 'needs_manual_review',
  APPROVED = 'approved',
  NO_WINNER = 'no_winner',
}

export enum ContestVisibility {
  PUBLIC = 'public',
  HIDDEN = 'hidden',
}

export enum ContestSubmissionStatus {
  ACCEPTED = 'accepted',
  ENQUEUED = 'enqueued',
  GENERATING = 'generating',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum ContestSubmissionEligibilityStatus {
  ELIGIBLE = 'eligible',
  INELIGIBLE_BLOCKED = 'ineligible_blocked',
  INELIGIBLE_REJECTED = 'ineligible_rejected',
  INELIGIBLE_UNPUBLISHED = 'ineligible_unpublished',
  INELIGIBLE_NO_TWEET = 'ineligible_no_tweet',
  INELIGIBLE_NO_RETWEET = 'ineligible_no_retweet',
  INELIGIBLE_TWEET_NOT_MATCHED = 'ineligible_tweet_not_matched',
  INELIGIBLE_USER_NOT_MATCHED = 'ineligible_user_not_matched',
  METRICS_FAILED = 'metrics_failed',
}

export enum ContestWinnerCandidateSource {
  INTERNAL_LIKES = 'internal_likes',
  TWITTER_ENGAGEMENT = 'twitter_engagement',
  MANUAL = 'manual',
}

export enum ContestWinnerCandidateReviewStatus {
  CANDIDATE = 'candidate',
  SELECTED = 'selected',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  INELIGIBLE = 'ineligible',
}

export enum ContestReviewActionType {
  FORCE_START = 'force_start',
  SNAPSHOT_CREATED = 'snapshot_created',
  CANDIDATE_SELECTED = 'candidate_selected',
  CANDIDATE_REJECTED = 'candidate_rejected',
  WINNER_APPROVED = 'winner_approved',
  NO_WINNER = 'no_winner',
}

export enum ContestRewardStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}
