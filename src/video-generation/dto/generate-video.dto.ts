import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VideoAIEnum } from 'src/common/enums/ai.enum';

export class GenerateVideoDto {
  @IsString()
  @ApiProperty({ description: 'Image url' })
  image_url: string;

  @IsString()
  @ApiProperty({ description: 'The prompt text for the post' })
  prompt: string;

  @IsEnum(VideoAIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: VideoAIEnum })
  ai_service: VideoAIEnum;
}
