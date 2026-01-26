import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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

  @IsEnum(VideoAIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: VideoAIEnum })
  ai_service: VideoAIEnum;
}
