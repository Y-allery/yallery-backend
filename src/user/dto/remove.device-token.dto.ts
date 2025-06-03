import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
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
}
