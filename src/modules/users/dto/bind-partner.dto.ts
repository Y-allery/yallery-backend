import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BindPartnerDto {
  @ApiProperty({
    description: 'Referral token of the partnership',
    example: 'b9169ac2-6a97-41a6-9ed6-50fce931b36b',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  ref: string;

  @ApiProperty({
    description: "Partner's own id for this user, taken from the deep link",
    example: '99392193123',
  })
  @IsString()
  @IsNotEmpty()
  // Matches partner_user_links.partnerUserId, so a longer value could never be stored.
  @MaxLength(255)
  puid: string;
}
