import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { MemeCharacterOrientation } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';

export class GenerateMemeDto {
  @IsString()
  @ApiProperty({
    description: 'Requested AI service/model identifier.',
    example: 'wan22_animate_native',
  })
  ai_service: string;

  @IsInt()
  @ApiProperty({
    description: 'Meme template ID from the memes catalog.',
    example: 1,
  })
  meme_id: number;

  @IsString()
  @ApiProperty({
    description:
      'Source image URL that will be animated with the meme template motion.',
    example:
      'https://yallery-api-prod.org/media/image/upload/octoai_images/user-photo.png',
  })
  image_url: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Optional prompt override. If omitted, the backend uses a default motion-transfer prompt.',
    example:
      'Make the character in the image follow the movements of the character in the video.',
  })
  prompt?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Optional negative prompt override for RunPod WAN motion transfer.',
    example: 'foreign limbs, copied background, jitter, flicker',
  })
  negative_prompt?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  @ApiPropertyOptional({
    description:
      'Character orientation hint for motion control. Defaults to the model setting.',
    enum: ['image', 'video'],
    example: 'video',
  })
  character_orientation?: MemeCharacterOrientation;
}
