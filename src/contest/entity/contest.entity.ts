import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './../../user/entities/user.entity';
import { PostEntity } from '../../post/entities/post.entity';
import { TagEntity } from '../../tag/entities/tag.entity';
import {
  ContestStatusEnum,
  ContestTypeEnum,
} from '../types/contest.status.enum';
import { ActivityEntity } from '../../activity/entities/activity.entity';
import { MediaAISettingsEntity } from '../../media-generation/entities/media-ai-settings.entity';
import { UserActivityEntity } from '../../user-activity/entities/user-activity.entity';

@Entity('contests')
export class ContestEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  imageUrl: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  fineTuneToken: string;

  @Column({ nullable: true })
  fineTuneTriggerWord: string;

  @Column({ nullable: true, default: 1 })
  fineTuneStrength: number;

  @Column({
    type: 'enum',
    enum: ContestTypeEnum,
    default: ContestTypeEnum.DEFAULT,
  })
  contestType: ContestTypeEnum;

  @Column({
    type: 'enum',
    enum: ContestStatusEnum,
    default: ContestStatusEnum.CLOSED,
  })
  status: ContestStatusEnum;

  @Column({ nullable: true })
  reward: number;

  @Column({ type: 'boolean', default: false, name: 'isApproved' })
  isApproved: boolean;

  @ManyToMany(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinTable()
  participants: UserEntity[];

  @OneToMany(() => PostEntity, (post) => post.contest, { onDelete: 'CASCADE' })
  posts: PostEntity[];

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  winner: UserEntity;

  @Column('timestamp', { name: 'startTime' })
  startTime: Date;

  @Column('timestamp', { name: 'endTime' })
  endTime: Date;

  @ManyToOne(() => TagEntity, (tag) => tag.contests, {
    nullable: true,
    onDelete: 'NO ACTION',
  })
  tag: TagEntity;

  @OneToMany(() => ActivityEntity, (activity) => activity.contest, {
    onDelete: 'CASCADE',
  })
  activities: ActivityEntity[];

  @OneToMany(() => UserActivityEntity, (activity) => activity.contest)
  userActivities: UserActivityEntity[];

  @Column({ type: 'text', nullable: true, name: 'promptExample' })
  promptExample: string;

  @ManyToOne(() => MediaAISettingsEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mediaAiSettingId' })
  mediaAiSetting: MediaAISettingsEntity | null;

  @Column({
    type: 'json',
    nullable: true,
    name: 'socialPostSettings',
  })
  socialPostSettings: { postToTwitter: boolean; postToInstagram: boolean } | null;

  @ManyToOne(() => PostEntity, (post) => post.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  postWinner: PostEntity;
}
