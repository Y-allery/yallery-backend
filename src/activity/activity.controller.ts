import { Controller, Get, Put, Query, Req, UseGuards, Post, Patch, Body } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { ActivityService } from './activity.service';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActivityEntity } from './entities/activity.entity';
import { ActivityEnum } from './types/activity.enum';
import { ClaimDailyRewardResponseDto } from './dto/claim-daily-reward.dto';
import { PopularPostsResponseDto } from './dto/popular-posts.dto';
import { MarkViewedDto } from '../post/dto/mark.viewed.dto';

@Controller('activity')
@ApiTags('Activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('user-profile-activity')
  @UseGuards(JwtAuthGuard)
  @ApiQuery({ name: 'filter', enum: ['earned', 'spent'], required: true })
  @ApiQuery({
    name: 'period',
    enum: ['day', 'week', 'month', 'year'],
    required: true,
  })
  @ApiOperation({ summary: 'Get user activities' })
  @ApiResponse({
    status: 200,
    description: 'Return user activities based on filter and period',
    type: [ActivityEntity],
  })
  async getUserActivities(
    @Req() req: AuthenticatedRequest,
    @Query('filter') filter: 'earned' | 'spent',
    @Query('period') period: 'day' | 'week' | 'month' | 'year',
  ) {
    const userId = req.user.id;
    return this.activityService.getFilteredActivities(userId, filter, period);
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get paginated activities for the authenticated user',
  })
  @ApiQuery({ name: 'skip', required: false, type: 'number', example: 0 })
  @ApiQuery({ name: 'take', required: false, type: 'number', example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Return paginated activities for the authenticated user',
    type: [ActivityEntity],
  })
  async getPaginatedActivitiesForUser(
    @Req() req: AuthenticatedRequest,
    @Query('skip') skip = 0,
    @Query('take') take = 10,
  ) {
    const userId = req.user.id;
    return this.activityService.getPaginatedActivitiesForUser(
      userId,
      skip,
      take,
    );
  }

  @Put('user/activities/mark-all-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Mark all activities as read for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully marked all activities as read',
  })
  async markAllActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markAllActivitiesAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-contest-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Mark all activities as read for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully marked all activities as read',
  })
  async markContestActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markContestActivityAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Put('user/activities/mark-collabs-as-read')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Mark all activities as read for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully marked all activities as read',
  })
  async markCollabsActivitiesAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    await this.activityService.markContestCollabsAsRead(userId);
    return { status: 'success', message: 'All activities marked as read' };
  }

  @Get('types')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get specific activity types' })
  @ApiResponse({
    status: 200,
    description: 'Return specific activity types with detailed descriptions',
    type: 'json',
  })
  async getAllActivityTypes(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return await this.activityService.getNotificationPreferences(userId, [
      ActivityEnum.LIKE_EARN,
      ActivityEnum.LIKE_SPEND,
    ]);
  }

  @Post('claim-daily-reward')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Claim daily reward' })
  @ApiResponse({
    status: 200,
    description: 'Daily reward claimed successfully or already claimed today',
    type: ClaimDailyRewardResponseDto
  })
  async claimDailyReward(@Req() req: AuthenticatedRequest): Promise<ClaimDailyRewardResponseDto> {
    const userId = req.user.id;
    return await this.activityService.claimDailyReward(userId);
  }

  @Get('popular-posts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get 6 most popular posts' })
  @ApiResponse({
    status: 200,
    description: 'Returns 6 most popular posts by likes and views',
    type: PopularPostsResponseDto
  })
  async getPopularPosts(@Req() req: AuthenticatedRequest): Promise<PopularPostsResponseDto> {
    const userId = req.user.id;
    return await this.activityService.getPopularPosts(userId);
  }

  @Patch('mark-posts-viewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark posts as viewed' })
  @ApiResponse({
    status: 200,
    description: 'Posts marked as viewed successfully',
  })
  async markPostsAsViewed(
    @Req() req: AuthenticatedRequest,
    @Body() markViewedDto: MarkViewedDto,
  ) {
    const userId = req.user.id;
    return await this.activityService.markPostsAsViewed(markViewedDto.ids, userId);
  }
}
