import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DeviceType } from '../types/device.interface';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'The device token for push notifications',
    example: 'abcdef123456',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    enum: DeviceType,
    description: 'The type of device',
    example: DeviceType.iOS,
  })
  @IsEnum(DeviceType)
  @IsNotEmpty()
  deviceType: DeviceType;
}
