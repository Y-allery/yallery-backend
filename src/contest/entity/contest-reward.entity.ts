import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { PostEntity } from '../../post/entities/post.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { ContestEntity } from './contest.entity';
import { ContestWinnerCandidateEntity } from './contest-winner-candidate.entity';
import { ContestRewardStatus } from '../types/contest-flow.enums';

@Entity('contest_rewards')
@Index('IDX_contest_rewards_contestId', ['contestId'], { unique: true })
@Index('IDX_contest_rewards_userId', ['userId'])
export class ContestRewardEntity extends TimeStampEntity {
  @Column({ type: 'int' })
  contestId: number;

  @ManyToOne(() => ContestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity;

  @Column({ type: 'int' })
  candidateId: number;

  @ManyToOne(() => ContestWinnerCandidateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId' })
  candidate: ContestWinnerCandidateEntity;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'int' })
  postId: number;

  @ManyToOne(() => PostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: PostEntity;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'varchar', length: 40, default: ContestRewardStatus.PENDING })
  status: ContestRewardStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;
}
