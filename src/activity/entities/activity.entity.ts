// src/activity/entities/activity.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { ActivityEnum } from '../types/activity.enum';
import { ContestEntity } from '../../contest/entity/contest.entity';
import { PostEntity } from '../../post/entities/post.entity';

@Entity('activity')
export class ActivityEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.activitiesInitiated, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'from_user_id' })
  fromUser: UserEntity;

  @ManyToOne(() => UserEntity, (user) => user.activitiesReceived, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'to_user_id' })
  toUser: UserEntity;

  @Column({ type: 'varchar' })
  activityType: ActivityEnum;

  @Column({ nullable: true, default: 0 })
  points: number;

  @Column()
  description: string;

  @Column({ type: Boolean, default: false })
  is_admin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: Boolean, default: false })
  isRead: boolean;

  @ManyToOne(() => ContestEntity, (contest) => contest.activities, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contest_id' })
  contest: ContestEntity | null;

  @ManyToOne(() => PostEntity, (post) => post.activities, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'post_id' })
  post: PostEntity | null;
}
