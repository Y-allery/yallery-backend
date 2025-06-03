import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentIntentDto {
  @ApiProperty({
    description: 'Product id',
    example: 'prod_Qv2tIlLFT2egZv',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;
}
