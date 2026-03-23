import { ApiProperty } from '@nestjs/swagger';

export class EnqueueMediaAudioResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: 'Audio generation task has been added to the queue.',
  })
  message: string;

  @ApiProperty({
    example: '1fd31f92-a2cf-4af0-9399-6cb608c224c4',
  })
  requestId: string;

  @ApiProperty({ example: 'queued' })
  status: string;
}
