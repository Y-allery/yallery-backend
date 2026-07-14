import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { UpdateContestDto } from 'src/modules/contests/dto/update.contest.dto';
import { ContestStatusEnum } from 'src/modules/contests/types/contest.status.enum';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { CreateContestDto } from 'src/modules/admin/dto/create-contest.dto';
import { ForceStartContestDto } from 'src/modules/admin/dto/force-start-contest.dto';
import { SetContestWinnerDto } from 'src/modules/admin/dto/set.contest.winner.dto';
import { ContentTranslationQueue } from 'src/modules/translations/content-translation.queue';
import { AdminContestsService } from './admin-contests.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminContestsController {
  constructor(
    private readonly adminContestsService: AdminContestsService,
    private readonly contentTranslationQueue: ContentTranslationQueue,
  ) {}

  @Post('create-contest')
  async createContest(@Body() dto: CreateContestDto) {
    const contest = await this.adminContestsService.createAdminContest(dto);
    if (contest?.contestId) {
      await this.contentTranslationQueue.enqueue('contest', contest.contestId);
    }
    return contest;
  }

  @Get('contests')
  @ApiOperation({ summary: 'Retrieve contests by status or all contests' })
  @ApiResponse({
    status: 200,
    description: 'Contests retrieved successfully.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter contests by status (open or closed)',
    enum: ContestStatusEnum,
  })
  async getAllContests(
    @Query('status') status?: ContestStatusEnum,
  ): Promise<any[]> {
    return this.adminContestsService.findAllContests(status);
  }

  @Put('contests/:id')
  @ApiOperation({ summary: 'Update a contest' })
  @ApiResponse({ status: 200, description: 'Contest updated successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async updateContest(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContestDto: UpdateContestDto,
  ) {
    const contest = await this.adminContestsService.updateContest(
      id,
      updateContestDto,
    );
    await this.contentTranslationQueue.enqueue('contest', id);
    return contest;
  }

  @Delete('contests/:id')
  @ApiOperation({ summary: 'Delete a contest' })
  @ApiResponse({ status: 200, description: 'Contest deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async deleteContest(@Param('id', ParseIntPipe) id: number) {
    return this.adminContestsService.deleteContest(id);
  }

  @Get('contests/posts-sorted-by-likes')
  @ApiOperation({ summary: 'Get all posts for a contest sorted by likes' })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved and sorted by likes successfully.',
  })
  async getPostsByContestSortedByLikes() {
    return this.adminContestsService.getPostsByContestSortedByLikes();
  }

  @Post('set-contest-winner')
  async setContestWinner(@Body() dto: SetContestWinnerDto) {
    return this.adminContestsService.setContestWinner(dto);
  }

  @Post('reject-contest-winner')
  @ApiOperation({ summary: 'Reject a contest winner' })
  @ApiResponse({
    status: 200,
    description: 'Contest winner rejected successfully.',
  })
  @ApiResponse({ status: 404, description: 'Post or contest not found.' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters.' })
  async rejectContestWinner(@Body() dto: SetContestWinnerDto) {
    return this.adminContestsService.rejectContestWinner(dto);
  }

  @Post('force-start-contest')
  @ApiOperation({ summary: 'Force start a specific contest immediately' })
  @ApiResponse({
    status: 200,
    description: 'Contest force started successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        contestId: { type: 'number' },
        contestName: { type: 'string' },
        startTime: { type: 'string' },
        notificationJobId: { type: 'string' },
        timestamp: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success', 'message', 'timestamp'],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - contest not found or already active',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async forceStartContest(@Body() dto: ForceStartContestDto) {
    return this.adminContestsService.forceStartContest(dto.contestId);
  }
}
