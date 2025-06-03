import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TweetDto {
  @ApiProperty({
    description: 'Publicly accessible URL of the image to be tweeted.',
    example: 'https://example.com/images/photo.png',
    type: String,
    format: 'url',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  post_id: string;
}
