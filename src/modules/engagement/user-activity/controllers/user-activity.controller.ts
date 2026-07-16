import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
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
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max items (1-500). Omit for the full period.' })
  @ApiQuery({ name: 'beforeId', required: false, type: Number, description: 'Cursor: return activities with id below this' })
  async getFeed(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserActivitiesDto,
  ) {
    return this.userActivityQueryService.getUserActivities({
      userId: req.user.id,
      filter: query.filter as any,
      category: query.category as any,
      period: query.period as any,
      limit: query.limit,
      beforeId: query.beforeId,
    });
  }

  @Patch('read-state')
  @ApiOperation({
    summary: 'Update read state',
    description:
      'Marks read/viewed state using one endpoint. Supported kind values: `feed` (mark activity feed as read), `regular_contests` (mark regular contest notifications as read), `fine_tune_contests` (mark fine-tune contest notifications as read), `stories` (mark provided `post_ids` as viewed).',
  })
  @ApiBody({
    description:
      'Use `kind` to choose what should be marked as read. Pass `post_ids` only for `stories`.',
    type: MarkUserReadStateDto,
    examples: {
      feed: {
        summary: 'Mark activity feed as read',
        value: {
          kind: 'feed',
        },
      },
      regularContests: {
        summary: 'Mark regular contests as read',
        value: {
          kind: 'regular_contests',
        },
      },
      fineTuneContests: {
        summary: 'Mark fine-tune contests as read',
        value: {
          kind: 'fine_tune_contests',
        },
      },
      stories: {
        summary: 'Mark stories as viewed',
        value: {
          kind: 'stories',
          post_ids: [123, 456],
        },
      },
    },
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
