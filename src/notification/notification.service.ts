import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationPreferenceEntity } from './entity/notification.preferences.entity';
import { Repository } from 'typeorm';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly notificationPrefMode: Repository<NotificationPreferenceEntity>,
  ) {}

  async setPreference(
    userId: number,
    activityType: ActivityEnum,
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
}
