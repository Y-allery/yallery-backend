import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_READ_STATE_KINDS } from '../types/user-read-state.constants';

export class MarkUserReadStateDto {
  @ApiProperty({
    enum: Object.values(USER_READ_STATE_KINDS),
    description:
      'Read-state action to apply: clear feed, clear regular contests, clear fine-tune contests, or mark stories as viewed.',
  })
  @IsEnum(USER_READ_STATE_KINDS)
  kind: (typeof USER_READ_STATE_KINDS)[keyof typeof USER_READ_STATE_KINDS];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Required only for stories. List of post IDs to mark as viewed.',
    example: [123, 456],
  })
  @ValidateIf((dto: MarkUserReadStateDto) => dto.kind === USER_READ_STATE_KINDS.STORIES)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  post_ids?: number[];
}
