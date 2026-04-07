import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
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
}
