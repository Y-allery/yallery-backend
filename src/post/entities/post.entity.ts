import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEntity } from './../../user/entities/user.entity';
import { TagEntity } from './../../tag/entities/tag.entity';
import { LikeEntity } from '../../like/entities/like.entity';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { ViewedPostEntity } from './viwed.entity';
import { ContestEntity } from '../../contest/entity/contest.entity';
import { ActivityEntity } from '../../activity/entities/activity.entity';

@Entity('posts')
export class PostEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  @Index()
  imageUrl: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  videoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  previewImageUrl: string | null;

  @ManyToOne(() => UserEntity, (user) => user.posts, { onDelete: 'CASCADE' })
  @Index()
  user: UserEntity;

  @OneToMany(() => ViewedPostEntity, (viewedPost) => viewedPost.post, {
    onDelete: 'CASCADE',
  })
  viewedBy: ViewedPostEntity[];

  @ManyToOne(() => TagEntity, (tag) => tag.posts)
  @Index()
  tag: TagEntity;

  @OneToMany(() => LikeEntity, (like) => like.post, { onDelete: 'CASCADE' })
  likes: LikeEntity[];

  @Column({ type: Boolean, default: false })
  @Index()
  is_published: boolean;

  @Column({ type: Boolean, default: false })
  is_saved: boolean;

  @Column({ type: Boolean, default: false })
  @Index()
  is_blocked: boolean;

  @ManyToOne(() => ContestEntity, (contest) => contest.posts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @Index()
  contest: ContestEntity;

  @Column({ type: 'boolean', default: false })
  @Index()
  is_rejected: boolean;

  @OneToMany(() => ActivityEntity, (activity) => activity.post)
  activities: ActivityEntity[];

  @Column({ type: 'boolean', default: true })
  is_delivered: boolean;

  @Column({ type: 'boolean', default: false })
  hasWonDailyReward: boolean;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  tweetLink: string;

  @Column({ type: 'json', nullable: true })
  generation_params: {
    prompt?: string;
    ai_service?: string;
    orientation?: 'horizontal' | 'vertical';
    style_id?: number;
    color_id?: number;
    width?: number;
    height?: number;
    negative_prompt?: string;
    suggestedTags?: { id: number; name: string }[];
  } | null;
}
