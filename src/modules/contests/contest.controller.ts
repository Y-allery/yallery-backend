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
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import {
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CONTEST_SWAGGER } from 'src/shared/swagger';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ContestTypeEnum,
  ContestStatusEnum,
} from './types/contest.status.enum';
import { RedisService } from 'src/core/database/redis.service.connect';
import { ContentTranslationService } from 'src/modules/translations/content-translation.service';
import { RequestLocale } from 'src/modules/translations/request-locale.decorator';
import {
  SupportedLocale,
  TRANSLATABLE_FIELDS,
} from 'src/modules/translations/translation.catalog';

@Controller('contest')
@ApiTags('Contest')
@UseGuards(JwtAuthGuard)
export class ContestController {
  constructor(
    private readonly contestService: ContestService,
    private readonly redisService: RedisService,
    private readonly contentTranslationService: ContentTranslationService,
  ) {}

  private localizeOne<T extends { id: number }>(
    contest: T,
    locale: SupportedLocale | null,
  ): Promise<T> {
    return this.contentTranslationService.resolve(
      'contest',
      contest.id,
      locale,
      contest,
      TRANSLATABLE_FIELDS.contest,
    );
  }

  private localizeMany<T extends { id: number }>(
    contests: T[],
    locale: SupportedLocale | null,
  ): Promise<T[]> {
    return this.contentTranslationService.resolveMany(
      'contest',
      locale,
      contests,
      TRANSLATABLE_FIELDS.contest,
    );
  }

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
  async getAllContests(
    @Req() req: AuthenticatedRequest,
    @RequestLocale() locale: SupportedLocale | null,
    @Query('type') type?: ContestTypeEnum,
    @Query('status') status?: ContestStatusEnum,
  ) {
    const contests = await this.contestService.getAllContests(
      req.user.id,
      type,
      status,
    );
    return this.localizeMany(contests, locale);
  }

  @Get('my-contests')
  async getMyContests(
    @Req() req: AuthenticatedRequest,
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const contests = await this.contestService.getMyContests(req.user.id);
    return this.localizeMany(contests, locale);
  }

  @Get('won-contests')
  @ApiOperation(CONTEST_SWAGGER.getWonContests)
  @ApiResponse(CONTEST_SWAGGER.getWonContests.responses.success)
  async getWonContests(
    @Req() req: AuthenticatedRequest,
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const contests = await this.contestService.getWonContests(req.user.id);
    return this.localizeMany(contests, locale);
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
    // TTL must exceed the 10-minute cron interval so a still-running sweep
    // keeps the lock past the next tick; a crashed run still expires. The
    // owner token means a sweep that outlives even this TTL releases only its
    // own lock, never one its successor has since taken.
    const lockToken = await this.redisService.acquireLock(lockKey, 1800);

    if (!lockToken) {
      console.log('⏸️  Contest update already in progress, skipping...');
      return;
    }

    try {
      await this.contestService.updateContestStatuses();
    } catch (error) {
      console.error(`❌ Cron job error:`, error.message);
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
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
  async getContestById(
    @Param('id') id: number,
    @Req() req: AuthenticatedRequest,
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const contest = await this.contestService.getContestById(+id, req.user.id);
    return contest?.id ? this.localizeOne(contest, locale) : contest;
  }
}
