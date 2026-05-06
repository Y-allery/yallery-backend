import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { UserNotificationTypeEnum } from '../types/user-notification-type.enum';

export class SetNotificationPreferenceDto {
  @ApiProperty({
    description: 'The type of activity for the notification preference',
    enum: UserNotificationTypeEnum,
    example: UserNotificationTypeEnum.LIKE_EARN,
  })
  @IsEnum(UserNotificationTypeEnum)
  activityType: UserNotificationTypeEnum;

  @ApiProperty({
    description: 'Whether the notification is enabled or disabled',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}
