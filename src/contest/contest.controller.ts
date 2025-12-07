import {
  Controller,
  Get,
  Query,
  Param,
  Req,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ContestService } from './contest.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { ApiParam, ApiQuery, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CONTEST_SWAGGER } from 'src/common/swagger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContestTypeEnum, ContestStatusEnum } from './types/contest.status.enum';
import { RedisService } from 'src/database/redis.service.connect';

@Controller('contest')
@ApiTags('Contest')
@UseGuards(JwtAuthGuard)
export class ContestController {
  constructor(
    private readonly contestService: ContestService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiOperation(CONTEST_SWAGGER.getAllContests)
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter contests by type (DEFAULT or FINE_TUNE)',
    enum: ContestTypeEnum,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter contests by status (open, closed, or pending_review)',
    enum: ContestStatusEnum,
  })
  @ApiResponse(CONTEST_SWAGGER.getAllContests.responses.success)
  getAllContests(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: ContestTypeEnum,
    @Query('status') status?: ContestStatusEnum,
  ) {
    return this.contestService.getAllContests(req.user.id, type, status);
  }

  @Get('my-contests')
  async getMyContests(@Req() req: AuthenticatedRequest) {
    return this.contestService.getMyContests(req.user.id);
  }

  @Get('won-contests')
  @ApiOperation(CONTEST_SWAGGER.getWonContests)
  @ApiResponse(CONTEST_SWAGGER.getWonContests.responses.success)
  async getWonContests(@Req() req: AuthenticatedRequest) {
    return this.contestService.getWonContests(req.user.id);
  }

  @Get('posts/:contestId')
  @ApiOperation(CONTEST_SWAGGER.getPostsByContest)
  @ApiParam({ name: 'contestId', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse(CONTEST_SWAGGER.getPostsByContest.responses.success)
  @ApiResponse(CONTEST_SWAGGER.getPostsByContest.responses.notFound)
  getPostsByContest(
    @Param('contestId') contestId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contestService.getPostsByContest(
      contestId,
      page,
      limit,
      req.user.id,
    );
  }

  @Get('example-contest')
  @ApiOperation(CONTEST_SWAGGER.getExampleContest)
  @ApiResponse(CONTEST_SWAGGER.getExampleContest.responses.success)
  getExmapleContest() {
    return this.contestService.getExampleContest();
  }

  @Post('join/:contestId')
  @ApiOperation(CONTEST_SWAGGER.joinContest)
  @ApiParam({ name: 'contestId', type: Number })
  @ApiResponse(CONTEST_SWAGGER.joinContest.responses.success)
  @ApiResponse(CONTEST_SWAGGER.joinContest.responses.badRequest)
  @ApiResponse(CONTEST_SWAGGER.joinContest.responses.notFound)
  async joinContest(
    @Param('contestId') contestId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contestService.participateInContest(contestId, req.user.id);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleContests() {
    const lockKey = 'contest:update:lock';
    const lockAcquired = await this.redisService.acquireLock(lockKey, 600);
    
    if (!lockAcquired) {
      console.log('⏸️  Contest update already in progress, skipping...');
      return;
    }
    
    try {
      await this.contestService.updateContestStatuses();
    } catch (error) {
      console.error(`❌ Cron job error:`, error.message);
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }



  @Get(':id')
  @ApiOperation(CONTEST_SWAGGER.getContestById)
  @ApiParam({
    name: 'id',
    description: 'ID of the contest to fetch',
    required: true,
    type: Number,
  })
  @ApiResponse(CONTEST_SWAGGER.getContestById.responses.success)
  @ApiResponse(CONTEST_SWAGGER.getContestById.responses.notFound)
  getContestById(@Param('id') id: number) {
    return this.contestService.findContestById(id);
  }
}
