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
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { UpdateContestDto } from 'src/contest/dto/update.contest.dto';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';
import { RoleEnum } from 'src/user/types/role.enum';
import { AdminService } from '../admin.service';
import { CreateContestDto } from '../dto/create-contest.dto';
import { ForceStartContestDto } from '../dto/force-start-contest.dto';
import { SetContestWinnerDto } from '../dto/set.contest.winner.dto';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminContestsController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create-contest')
  async createContest(@Body() dto: CreateContestDto) {
    return this.adminService.createAdminContest(dto);
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
    return this.adminService.findAllContests(status);
  }

  @Put('contests/:id')
  @ApiOperation({ summary: 'Update a contest' })
  @ApiResponse({ status: 200, description: 'Contest updated successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async updateContest(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContestDto: UpdateContestDto,
  ) {
    return this.adminService.updateContest(id, updateContestDto);
  }

  @Delete('contests/:id')
  @ApiOperation({ summary: 'Delete a contest' })
  @ApiResponse({ status: 200, description: 'Contest deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async deleteContest(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteContest(id);
  }

  @Get('contests/posts-sorted-by-likes')
  @ApiOperation({ summary: 'Get all posts for a contest sorted by likes' })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved and sorted by likes successfully.',
  })
  async getPostsByContestSortedByLikes() {
    return this.adminService.getPostsByContestSortedByLikes();
  }

  @Post('set-contest-winner')
  async setContestWinner(@Body() dto: SetContestWinnerDto) {
    return this.adminService.setContestWinner(dto);
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
    return this.adminService.rejectContestWinner(dto);
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
    return this.adminService.forceStartContest(dto.contestId);
  }
}
