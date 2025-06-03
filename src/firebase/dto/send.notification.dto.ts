import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'The device token to which the notification will be sent',
    example: 'your_device_token',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'The title of the notification',
    example: 'Test Notification',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'The body of the notification',
    example: 'This is a test notification',
  })
  @IsString()
  body: string;
}
