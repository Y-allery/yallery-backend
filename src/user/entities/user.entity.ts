import { PostEntity } from '../../post/entities/post.entity';
import { TagEntity } from './../../tag/entities/tag.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { LikeEntity } from '../../like/entities/like.entity';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { ViewedPostEntity } from '../../post/entities/viwed.entity';
import { ActivityEntity } from '../../activity/entities/activity.entity';
import { DeviceTokenEntity } from './device-token.entity';
import { NotificationPreferenceEntity } from '../../notification/entity/notification.preferences.entity';
import { RoleEnum } from '../types/role.enum';
import { ReferralEntity } from './user-refferals.entity';

@Entity('users')
export class UserEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true, unique: true })
  nickname: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ default: true })
  notificationsEnabled: boolean;

  @Column({ nullable: true })
  refreshToken: string;

  @Column({ nullable: true })
  resetToken: string;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpiration: Date;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ default: false })
  is_deleted: boolean;

  @Column({
    default: RoleEnum.USER,
    nullable: false,
    enum: RoleEnum,
    type: 'enum',
  })
  role: RoleEnum;

  @Column({ default: true })
  bonusEligible: boolean;

  @Column({ default: true })
  emailVerified: boolean;

  @Column({ nullable: true, unique: true })
  verificationToken: string;

  @Column({ type: 'json', nullable: true })
  twitterCredentials?: {
    token?: string;
    tokenSecret?: string;
  };

  @ManyToMany(() => TagEntity, (tag) => tag.users, { onDelete: 'CASCADE' })
  @JoinTable()
  tags: TagEntity[];

  @OneToMany(() => PostEntity, (post) => post.user, { onDelete: 'CASCADE' })
  posts: PostEntity[];

  @OneToMany(() => LikeEntity, (like) => like.user, { onDelete: 'CASCADE' })
  likes: LikeEntity[];

  @Column({ nullable: true, unique: false })
  twitterUsername: string;

  @OneToMany(() => ViewedPostEntity, (viewedPost) => viewedPost.user, {
    onDelete: 'CASCADE',
  })
  viewedPosts: ViewedPostEntity[];

  @OneToMany(() => ActivityEntity, (activity) => activity.fromUser, {
    onDelete: 'CASCADE',
  })
  activitiesInitiated: ActivityEntity[];

  @OneToMany(() => ActivityEntity, (activity) => activity.toUser, {
    onDelete: 'CASCADE',
  })
  activitiesReceived: ActivityEntity[];

  @OneToMany(() => DeviceTokenEntity, (deviceToken) => deviceToken.user, {
    onDelete: 'CASCADE',
  })
  deviceTokens: DeviceTokenEntity[];

  @OneToMany(
    () => NotificationPreferenceEntity,
    (preference) => preference.user,
    { onDelete: 'CASCADE' },
  )
  notificationPreferences: NotificationPreferenceEntity[];

  @Column({ nullable: true, unique: true, type: 'bigint' })
  telegramId: number;

  @OneToMany(() => ReferralEntity, (referral) => referral.user)
  referrals: ReferralEntity[];

  @Column({ type: 'timestamp', nullable: true })
  lastShareRewardAt: Date | null;
}
