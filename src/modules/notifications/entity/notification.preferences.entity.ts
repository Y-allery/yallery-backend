import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { UserNotificationTypeEnum } from '../types/user-notification-type.enum';

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
    enum: UserNotificationTypeEnum,
  })
  activityType: UserNotificationTypeEnum;

  @Column({ default: true })
  enabled: boolean;
}
