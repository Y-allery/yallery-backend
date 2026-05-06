import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ContestEntity } from './contest.entity';
import { ContestSubmissionEntity } from './contest-submission.entity';
import {
  ContestSubmissionEligibilityStatus,
  ContestWinnerCandidateReviewStatus,
  ContestWinnerCandidateSource,
} from '../types/contest-flow.enums';

@Entity('contest_winner_candidates')
@Index('IDX_contest_winner_candidates_contest_rank', ['contestId', 'rank'])
@Index('IDX_contest_winner_candidates_submissionId', ['submissionId'])
@Index('IDX_contest_winner_candidates_reviewStatus', ['reviewStatus'])
export class ContestWinnerCandidateEntity extends TimeStampEntity {
  @Column({ type: 'int' })
  contestId: number;

  @ManyToOne(() => ContestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity;

  @Column({ type: 'int', nullable: true })
  submissionId: number | null;

  @ManyToOne(() => ContestSubmissionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submissionId' })
  submission: ContestSubmissionEntity | null;

  @Column({ type: 'int', nullable: true })
  postId: number | null;

  @ManyToOne(() => PostEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'postId' })
  post: PostEntity | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity | null;

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'float', default: 0 })
  score: number;

  @Column({ type: 'json', nullable: true })
  scoreBreakdown: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 40 })
  source: ContestWinnerCandidateSource;

  @Column({
    type: 'varchar',
    length: 80,
    default: ContestSubmissionEligibilityStatus.ELIGIBLE,
  })
  eligibilityStatus: ContestSubmissionEligibilityStatus;

  @Column({
    type: 'varchar',
    length: 40,
    default: ContestWinnerCandidateReviewStatus.CANDIDATE,
  })
  reviewStatus: ContestWinnerCandidateReviewStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;
}
