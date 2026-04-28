import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PreviewAIFinetuneLoraKeyDto {
  @ApiProperty({ example: 'yallery_slurpy' })
  @IsString()
  triggerWord: string;
}
