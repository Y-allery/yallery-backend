import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationType {
  PUSH = 'push',
  EMAIL = 'email',
}

export class BroadcastNotificationDto {
  @ApiProperty({
    enum: NotificationType,
    description: 'Type of notification to send',
    example: NotificationType.PUSH,
  })
  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @ApiProperty({
    description: 'Title/subject of the notification',
    example: 'Important Update',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Body/content of the notification',
    example: 'We have an important update for you!',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Email subject (required for email type)',
    example: 'Important Update from Yallery',
    required: false,
  })
  @IsString()
  @IsOptional()
  emailSubject?: string;
}

