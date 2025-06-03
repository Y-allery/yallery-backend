import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UseReferralCodeDto {
  @ApiProperty({
    description: 'Refferal code exmaple',
    example: 'abc123',
  })
  @IsNotEmpty()
  @IsString()
  code: string;
}
