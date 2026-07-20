import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DeviceType } from '../types/device.interface';

export class UnregisterDeviceTokenDto {
  @ApiProperty({
    enum: DeviceType,
    description: 'The type of the device (e.g., iOS, Android)',
    example: DeviceType.iOS,
  })
  @IsEnum(DeviceType)
  @IsNotEmpty()
  deviceType: DeviceType;

  @ApiPropertyOptional({
    description:
      'The specific token to unregister. Preferred: without it every token ' +
      'of this device type is removed, so logging out of one Android phone ' +
      'also silences the user\'s other Android devices. Optional so clients ' +
      'that predate this field keep working.',
    example: 'abcdef123456',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token?: string;
}
