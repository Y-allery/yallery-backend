import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationPreferenceEntity } from './entity/notification.preferences.entity';
import { In, Repository } from 'typeorm';
import { UserNotificationTypeEnum } from './types/user-notification-type.enum';
import { SupportedLocale } from 'src/modules/translations/translation.catalog';
import { NOTIFICATION_PREFERENCE_COPY } from './notification-preference-copy';

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
    locale: SupportedLocale | null = null,
  ) {
    const preferences = await this.notificationPrefMode.find({
      where: {
        user: { id: userId },
        activityType: In(types),
      },
    });

    const copy =
      NOTIFICATION_PREFERENCE_COPY[locale ?? 'en'] ??
      NOTIFICATION_PREFERENCE_COPY.en;

    return types.map((type) => ({
      key: type,
      description: copy[type] ?? NOTIFICATION_PREFERENCE_COPY.en[type],
      enabled: preferences.some((p) => p.activityType === type && p.enabled),
    }));
  }
}
