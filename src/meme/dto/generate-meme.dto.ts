import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateMemeDto {
  @IsNumber()
  @ApiProperty({ description: 'Meme template ID', example: 1 })
  memeId: number;

  @IsString()
  @ApiProperty({
    description: 'User image URL (source image for generation)',
    example: 'https://res.cloudinary.com/xxx/image/upload/v1/user-photo.jpg',
  })
  imageUrl: string;
}
