import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GetUserActivitiesDto } from '../dto/get-user-activities.dto';
import { MarkUserReadStateDto } from '../dto/mark-user-read-state.dto';
import { UserActivityQueryService } from '../services/user-activity-query.service';
import { UserReadStateService } from '../services/user-read-state.service';

@Controller('user-activity')
@UseGuards(JwtAuthGuard)
@ApiTags('User Activity')
export class UserActivityController {
  constructor(
    private readonly userActivityQueryService: UserActivityQueryService,
    private readonly userReadStateService: UserReadStateService,
  ) {}

  @Get('types')
  async getTypes() {
    return this.userActivityQueryService.getTypes();
  }

  @Get('feed')
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'earned', 'spent'] })
  @ApiQuery({ name: 'category', required: false, enum: ['social', 'generation', 'contest'] })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month', 'year'] })
  async getFeed(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserActivitiesDto,
  ) {
    return this.userActivityQueryService.getUserActivities({
      userId: req.user.id,
      filter: query.filter as any,
      category: query.category as any,
      period: query.period as any,
    });
  }

  @Patch('read-state')
  @ApiOperation({
    summary: 'Update read state',
    description:
      'Marks activity feed items, regular contests, fine-tune contests, or stories as read/viewed using a single user-facing endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Read state updated successfully',
  })
  async markReadState(
    @Req() req: AuthenticatedRequest,
    @Body() body: MarkUserReadStateDto,
  ) {
    return await this.userReadStateService.markReadState(req.user.id, body);
  }
}
