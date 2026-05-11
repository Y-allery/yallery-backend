import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationPreferenceEntity } from './entity/notification.preferences.entity';
import { In, Repository } from 'typeorm';
import { UserNotificationTypeEnum } from './types/user-notification-type.enum';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly notificationPrefMode: Repository<NotificationPreferenceEntity>,
  ) {}

  async setPreference(
    userId: number,
    activityType: UserNotificationTypeEnum,
    enabled: boolean,
  ) {
    let preference = await this.notificationPrefMode.findOne({
      where: { user: { id: userId }, activityType },
    });

    if (!preference) {
      preference = this.notificationPrefMode.create({
        user: { id: userId },
        activityType,
        enabled,
      });
    } else {
      preference.enabled = enabled;
    }

    await this.notificationPrefMode.save(preference);
  }

  async getNotificationPreferences(
    userId: number,
    types: UserNotificationTypeEnum[],
  ) {
    const preferences = await this.notificationPrefMode.find({
      where: {
        user: { id: userId },
        activityType: In(types),
      },
    });

    const defaultDescriptions: Record<string, string> = {
      LIKE_EARN: 'Like earn notification can be disabled.',
      LIKE_SPEND: 'Like spend notification can be disabled.',
    };

    return types.map((type) => ({
      key: type,
      description: defaultDescriptions[type],
      enabled: preferences.some((p) => p.activityType === type && p.enabled),
    }));
  }
}
