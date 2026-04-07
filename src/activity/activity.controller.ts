import { Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { ActivityService } from './activity.service';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ACTIVITY_SWAGGER } from 'src/common/swagger';

@Controller('activity')
@ApiTags('Activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('user-profile-activity')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(ACTIVITY_SWAGGER.getUserActivities)
  @ApiQuery({ name: 'filter', enum: ['earned', 'spent'], required: true })
  @ApiQuery({
    name: 'period',
    enum: ['day', 'week', 'month', 'year'],
    required: true,
  })
  @ApiResponse(ACTIVITY_SWAGGER.getUserActivities.responses.success)
  async getUserActivities(
    @Req() req: AuthenticatedRequest,
    @Query('filter') filter: 'earned' | 'spent',
    @Query('period') period: 'day' | 'week' | 'month' | 'year',
  ) {
    const userId = req.user.id;
    return this.activityService.getFilteredActivities(userId, filter, period);
  }

  @Put('user/activities/mark-all-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(ACTIVITY_SWAGGER.markAllActivitiesAsRead)
  @ApiResponse(ACTIVITY_SWAGGER.markAllActivitiesAsRead.responses.success)
  async markAllActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markAllActivitiesAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-contest-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(ACTIVITY_SWAGGER.markContestActivitiesAsRead)
  @ApiResponse(ACTIVITY_SWAGGER.markContestActivitiesAsRead.responses.success)
  async markContestActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markContestActivityAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-collabs-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(ACTIVITY_SWAGGER.markCollabsActivitiesAsRead)
  @ApiResponse(ACTIVITY_SWAGGER.markCollabsActivitiesAsRead.responses.success)
  async markCollabsActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markContestCollabsAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }
}
