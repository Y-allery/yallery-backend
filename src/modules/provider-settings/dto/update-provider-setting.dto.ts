import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdateProviderSettingDto {
  @ApiProperty({
    description: 'New setting value. Secrets are stored encrypted and never returned in plaintext.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
    ],
  })
  @IsOptional()
  value?: string | number | boolean | null;
}
