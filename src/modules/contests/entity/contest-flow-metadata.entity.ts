import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';
import { ContestEntity } from './contest.entity';
import {
  ContestFlowVersion,
  ContestLifecycleStatus,
  ContestReviewStatus,
  ContestVisibility,
} from '../types/contest-flow.enums';

@Entity('contest_flow_metadata')
@Index('IDX_contest_flow_metadata_contestId', ['contestId'], { unique: true })
@Index('IDX_contest_flow_metadata_lifecycleStatus', ['lifecycleStatus'])
@Index('IDX_contest_flow_metadata_reviewStatus', ['reviewStatus'])
export class ContestFlowMetadataEntity extends TimeStampEntity {
  @Column({ type: 'int' })
  contestId: number;

  @OneToOne(() => ContestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity;

  @Column({ type: 'varchar', length: 20, default: ContestFlowVersion.V2 })
  flowVersion: ContestFlowVersion;

  @Column({
    type: 'varchar',
    length: 40,
    default: ContestLifecycleStatus.SCHEDULED,
  })
  lifecycleStatus: ContestLifecycleStatus;

  @Column({ type: 'varchar', length: 40, default: ContestReviewStatus.NONE })
  reviewStatus: ContestReviewStatus;

  @Column({ type: 'varchar', length: 20, default: ContestVisibility.PUBLIC })
  visibility: ContestVisibility;

  @Column({ type: 'timestamp', nullable: true })
  reviewSnapshotAt: Date | null;
}
