import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { PostEntity } from '../../post/entities/post.entity';
import { ContestEntity } from '../../contest/entity/contest.entity';

@Entity('user_activities')
@Index('IDX_user_activities_user_created_at', ['user', 'createdAt'])
@Index('IDX_user_activities_user_is_read_created_at', ['user', 'isRead', 'createdAt'])
export class UserActivityEntity extends TimeStampEntity {
  @ManyToOne(() => UserEntity, (user) => user.userActivities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => UserEntity, (user) => user.userActivitiesAuthored, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actorUserId' })
  actorUser: UserEntity | null;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'int', default: 0 })
  pointsDelta: number;

  @Column({ type: 'text' })
  descriptionSnapshot: string;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, any> | null;

  @ManyToOne(() => PostEntity, (post) => post.userActivities, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'postId' })
  post: PostEntity | null;

  @ManyToOne(() => ContestEntity, (contest) => contest.userActivities, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contestId' })
  contest: ContestEntity | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  previewUrl: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;
}
