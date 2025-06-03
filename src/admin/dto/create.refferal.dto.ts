import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PartnershipSource } from '../entities/partner.entity';

export class CreatePartnershipDto {
  @IsString()
  @IsNotEmpty()
  partnerName: string;

  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsEnum(PartnershipSource)
  source: PartnershipSource;
}
