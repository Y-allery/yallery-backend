import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { ActivityEnum } from '../../activity/types/activity.enum';

@Entity('notification_preferences')
@Unique(['user', 'activityType'])
export class NotificationPreferenceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.notificationPreferences, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;

  @Column({
    type: 'enum',
    enum: ActivityEnum,
  })
  activityType: ActivityEnum;

  @Column({ default: true })
  enabled: boolean;
}
