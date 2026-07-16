import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  USER_ACTIVITY_CATEGORIES,
  USER_ACTIVITY_FILTERS,
  USER_ACTIVITY_PERIODS,
} from '../types/user-activity.constants';

export class GetUserActivitiesDto {
  @ApiPropertyOptional({
    enum: Object.values(USER_ACTIVITY_FILTERS),
    default: USER_ACTIVITY_FILTERS.ALL,
  })
  @IsOptional()
  @IsIn(Object.values(USER_ACTIVITY_FILTERS))
  filter?: string;

  @ApiPropertyOptional({
    enum: Object.values(USER_ACTIVITY_CATEGORIES),
  })
  @IsOptional()
  @IsIn(Object.values(USER_ACTIVITY_CATEGORIES))
  category?: string;

  @ApiPropertyOptional({
    enum: Object.values(USER_ACTIVITY_PERIODS),
    default: USER_ACTIVITY_PERIODS.WEEK,
  })
  @IsOptional()
  @IsIn(Object.values(USER_ACTIVITY_PERIODS))
  period?: string;

  @ApiPropertyOptional({
    description:
      'Max number of activities to return (1-500). Omit for the full period, ' +
      'which is what the current mobile client does — it has no paging UI, so ' +
      'a default cap here would silently truncate a heavy user\'s history.',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Cursor for pagination: only activities with id lower than this are returned.',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeId?: number;
}
