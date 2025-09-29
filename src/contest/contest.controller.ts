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
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContestTypeEnum } from './types/contest.status.enum';

@Controller('contest')
@ApiTags('Contest')
@UseGuards(JwtAuthGuard)
export class ContestController {
  constructor(private readonly contestService: ContestService) {}

  @Get()
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter contests by status (open or closed)',
    enum: ContestTypeEnum,
  })
  getAllContests(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: ContestTypeEnum,
  ) {
    return this.contestService.getAllContests(req.user.id, type);
  }

  @Get('my-contests')
  async getMyContests(@Req() req: AuthenticatedRequest) {
    console.log(true);
    return this.contestService.getMyContests(req.user.id);
  }

  @Get('won-contests')
  async getWonContests(@Req() req: AuthenticatedRequest) {
    return this.contestService.getWonContests(req.user.id);
  }

  @Get('posts/:contestId')
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
  getExmapleContest() {
    return this.contestService.getExampleContest();
  }

  @Post('join/:contestId')
  async joinContest(
    @Param('contestId') contestId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contestService.participateInContest(contestId, req.user.id);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleContests() {
    console.log(`⏰ CRON JOB: Starting contest status update at ${new Date().toISOString()}`);
    try {
      await this.contestService.updateContestStatuses();
      console.log(`✅ CRON JOB: Contest status update completed successfully`);
    } catch (error) {
      console.error(`❌ CRON JOB: Error in contest status update:`, error.message);
      console.error(`❌ CRON JOB: Full error:`, error);
    }
  }



  @Get(':id')
  @ApiParam({
    name: 'id',
    description: 'ID of the contest to fetch',
    required: true,
    type: Number,
  })
  getContestById(@Param('id') id: number) {
    return this.contestService.findContestById(id);
  }
}
