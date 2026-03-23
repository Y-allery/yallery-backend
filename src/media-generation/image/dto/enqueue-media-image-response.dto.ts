import { ApiProperty } from '@nestjs/swagger';

export class EnqueueMediaImageResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: 'Image generation task has been added to the queue.',
  })
  message: string;

  @ApiProperty({
    description: 'Backend request id used to correlate socket updates.',
    example: '0e8d2854-8806-44dd-88be-7fd246e4cc45',
  })
  requestId: string;

  @ApiProperty({
    example: 'queued',
  })
  status: string;
}
