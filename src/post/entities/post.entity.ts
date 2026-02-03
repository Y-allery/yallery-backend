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

  @Column({ type: 'boolean', default: false, name: 'hasAudio' })
  hasAudio: boolean;

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

  @Column({ type: Boolean, default: false, name: 'isPublished' })
  @Index()
  isPublished: boolean;

  @Column({ type: Boolean, default: false, name: 'isSaved' })
  isSaved: boolean;

  @Column({ type: Boolean, default: false, name: 'isBlocked' })
  @Index()
  isBlocked: boolean;

  @ManyToOne(() => ContestEntity, (contest) => contest.posts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @Index()
  contest: ContestEntity;

  @Column({ type: 'boolean', default: false, name: 'isRejected' })
  @Index()
  isRejected: boolean;

  @OneToMany(() => ActivityEntity, (activity) => activity.post)
  activities: ActivityEntity[];

  @Column({ type: 'boolean', default: true, name: 'isDelivered' })
  isDelivered: boolean;

  @Column({ type: 'boolean', default: false })
  hasWonDailyReward: boolean;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  tweetLink: string;

  @Column({ type: 'json', nullable: true, name: 'generationParams' })
  generationParams: {
    prompt?: string;
    aiService?: string;
    orientation?: 'horizontal' | 'vertical';
    styleId?: number;
    colorId?: number;
    width?: number;
    height?: number;
    duration?: number;
    negativePrompt?: string;
    suggestedTags?: { id: number; name: string }[];
  } | null;
}
