import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';
import { ViewedPostEntity } from './viwed.entity';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { UserActivityEntity } from 'src/modules/engagement/user-activity/entities/user-activity.entity';

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

  @OneToMany(() => UserActivityEntity, (activity) => activity.post)
  userActivities: UserActivityEntity[];

  @Column({ type: 'boolean', default: true, name: 'isDelivered' })
  isDelivered: boolean;

  @Column({ type: 'boolean', default: false })
  hasWonDailyReward: boolean;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  tweetLink: string;

  @Column({ type: 'json', nullable: true, name: 'generationParams' })
  generationParams: {
    /** Generation task (BullMQ job) id; persisted on the offline path so the undelivered replay can carry it like live events do. */
    taskId?: string;
    prompt?: string;
    translatedPrompt?: string;
    resolvedPrompt?: string;
    aiService?: string;
    orientation?: 'horizontal' | 'vertical';
    styleId?: number;
    styleName?: string;
    colorId?: number;
    colorName?: string;
    loraKey?: string | null;
    loraScale?: number | null;
    triggerWord?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number;
    seed?: number | null;
    negativePrompt?: string;
    /** Meme generation (Kling motion control) */
    memeId?: number;
    sourceImageUrl?: string;
    sourceVideoUrl?: string;
    sourceVideoDurationSeconds?: number | null;
    billableDurationSeconds?: number | null;
    memeName?: string;
    characterOrientation?: 'image' | 'video';
  } | null;
}
