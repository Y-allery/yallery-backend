import { IsEnum, IsArray, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AIEnum } from 'src/common/enums/ai.enum';

export class RefundCreditDto {
  @ApiProperty({
    description: 'List of post IDs for which credits should be refunded',
    example: [101, 102, 103],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  posts: number[];

  @ApiProperty({
    description: 'AI service used for image generation',
    enum: AIEnum,
    example: AIEnum.FLUX,
  })
  @IsEnum(AIEnum)
  ai_service: AIEnum;
}
