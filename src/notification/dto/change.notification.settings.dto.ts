import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { ActivityEnum } from 'src/activity/types/activity.enum';

export class SetNotificationPreferenceDto {
  @ApiProperty({
    description: 'The type of activity for the notification preference',
    enum: ActivityEnum,
    example: ActivityEnum.LIKE_EARN,
  })
  @IsEnum(ActivityEnum)
  activityType: ActivityEnum;

  @ApiProperty({
    description: 'Whether the notification is enabled or disabled',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}
