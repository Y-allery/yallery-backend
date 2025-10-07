import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
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

  // Used only when source === WEB_APP. If provided, link will target the contest page
  @IsOptional()
  @IsNumber()
  contestId?: number;
}
