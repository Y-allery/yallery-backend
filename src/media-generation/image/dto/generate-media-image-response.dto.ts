import { ApiProperty } from '@nestjs/swagger';

export class GenerateMediaImageResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Final Cloudinary URLs returned by the new media generation flow.',
    type: [String],
    example: [
      'https://res.cloudinary.com/demo/image/upload/v123/octoai_images/abc.jpg',
      'https://res.cloudinary.com/demo/image/upload/v123/octoai_images/def.jpg',
    ],
  })
  images: string[];

  @ApiProperty({
    description: 'RunPod job id for tracing and debugging.',
    example: 'sync-abc123xyz',
  })
  jobId: string;

  @ApiProperty({
    description: 'Model name configured for the worker or `default`.',
    example: 'segmind/SSD-1B',
  })
  providerModel: string;

  @ApiProperty({
    description: 'Request duration in milliseconds.',
    example: 8421,
  })
  elapsedMs: number;
}
