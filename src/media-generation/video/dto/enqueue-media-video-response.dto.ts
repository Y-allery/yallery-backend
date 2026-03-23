import { ApiProperty } from '@nestjs/swagger';
import { MediaGenerationRequestStatus } from '../../shared/media-generation.types';

export class EnqueueMediaVideoResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: 'Video generation task has been added to the queue.',
  })
  message: string;

  @ApiProperty({
    example: '5b0c1f71-8305-4c4f-aef8-3edb25f2bb39',
  })
  requestId: string;

  @ApiProperty({
    enum: MediaGenerationRequestStatus,
    example: MediaGenerationRequestStatus.QUEUED,
  })
  status: MediaGenerationRequestStatus;
}
