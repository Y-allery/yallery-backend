import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { ContestEntity } from './contest.entity';
import { ContestWinnerCandidateEntity } from './contest-winner-candidate.entity';
import { ContestReviewActionType } from '../types/contest-flow.enums';

@Entity('contest_review_actions')
@Index('IDX_contest_review_actions_contestId', ['contestId'])
@Index('IDX_contest_review_actions_actionType', ['actionType'])
export class ContestReviewActionEntity extends TimeStampEntity {
  @Column({ type: 'int' })
  contestId: number;

  @ManyToOne(() => ContestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity;

  @Column({ type: 'int', nullable: true })
  candidateId: number | null;

  @ManyToOne(() => ContestWinnerCandidateEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'candidateId' })
  candidate: ContestWinnerCandidateEntity | null;

  @Column({ type: 'int', nullable: true })
  adminUserId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'adminUserId' })
  adminUser: UserEntity | null;

  @Column({ type: 'varchar', length: 60 })
  actionType: ContestReviewActionType;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;
}
