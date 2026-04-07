import {
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GetUserActivitiesDto } from '../dto/get-user-activities.dto';
import { UserActivityQueryService } from '../services/user-activity-query.service';

@Controller('user-activity')
@UseGuards(JwtAuthGuard)
@ApiTags('User Activity')
export class UserActivityController {
  constructor(
    private readonly userActivityQueryService: UserActivityQueryService,
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

  @Put('mark-all-as-read')
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    await this.userActivityQueryService.markAllAsRead(req.user.id);
    return { status: 'success', message: 'All user activities marked as read' };
  }

  @Put('mark-contests-as-read')
  async markContestsAsRead(@Req() req: AuthenticatedRequest) {
    await this.userActivityQueryService.markContestActivitiesAsRead(
      req.user.id,
    );
    return {
      status: 'success',
      message: 'Contest user activities marked as read',
    };
  }
}
