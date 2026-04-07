import { Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GetUserActivitiesDto } from '../dto/get-user-activities.dto';
import { UserActivityQueryService } from '../services/user-activity-query.service';

@Controller('activity')
@UseGuards(JwtAuthGuard)
@ApiExcludeController()
export class LegacyActivityCompatController {
  constructor(
    private readonly userActivityQueryService: UserActivityQueryService,
  ) {}

  @Get('user-profile-activity')
  async getUserActivities(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserActivitiesDto,
  ) {
    return this.userActivityQueryService.getUserActivities({
      userId: req.user.id,
      filter: query.filter as any,
      period: query.period as any,
    });
  }

  @Put('user/activities/mark-all-as-read')
  async markAllActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    await this.userActivityQueryService.markAllAsRead(req.user.id);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-contest-as-read')
  async markContestActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    await this.userActivityQueryService.markContestActivitiesAsRead(
      req.user.id,
    );
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-collabs-as-read')
  async markCollabsActivitiesAsRead() {
    return { status: 'success', message: 'All activities marked as read' };
  }
}
