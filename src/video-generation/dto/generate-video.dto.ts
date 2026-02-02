import { IsEnum, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoAIEnum } from 'src/common/enums/ai.enum';

export class GenerateVideoDto {
  @ValidateIf((o: GenerateVideoDto) => o.ai_service === VideoAIEnum.BYTY_DANCE)
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Image url (required for image-to-video models)',
    required: false,
  })
  image_url?: string;

  @IsString()
  @ApiProperty({ description: 'The prompt text for the post' })
  prompt: string;

  @IsOptional()
  @IsIn([5, 10])
  @ApiPropertyOptional({
    description: 'Video duration in seconds (supported: 5 or 10)',
    enum: [5, 10],
    example: 5,
  })
  duration?: number;

  @IsEnum(VideoAIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: VideoAIEnum })
  ai_service: VideoAIEnum;
}
