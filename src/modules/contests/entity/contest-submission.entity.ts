import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ContestEntity } from './contest.entity';
import {
  ContestSubmissionEligibilityStatus,
  ContestSubmissionStatus,
} from '../types/contest-flow.enums';

@Entity('contest_submissions')
@Index('IDX_contest_submissions_contestId', ['contestId'])
@Index('IDX_contest_submissions_userId', ['userId'])
@Index('IDX_contest_submissions_postId', ['postId'])
@Index('IDX_contest_submissions_generationJobId', ['generationJobId'])
@Index('IDX_contest_submissions_status', ['status'])
export class ContestSubmissionEntity extends TimeStampEntity {
  @Column({ type: 'int' })
  contestId: number;

  @ManyToOne(() => ContestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'int', nullable: true })
  postId: number | null;

  @ManyToOne(() => PostEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'postId' })
  post: PostEntity | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  generationJobId: string | null;

  @Column({ type: 'timestamp' })
  submittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', length: 40 })
  mediaKind: string;

  @Column({ type: 'int', nullable: true })
  aiSettingId: number | null;

  @ManyToOne(() => MediaAISettingsEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'aiSettingId' })
  aiSetting: MediaAISettingsEntity | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: ContestSubmissionStatus.ACCEPTED,
  })
  status: ContestSubmissionStatus;

  @Column({
    type: 'varchar',
    length: 80,
    default: ContestSubmissionEligibilityStatus.ELIGIBLE,
  })
  eligibilityStatus: ContestSubmissionEligibilityStatus;
}
