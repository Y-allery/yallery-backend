import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import {
  ContestCandidateRejectDto,
  ContestNoWinnerDto,
} from 'src/modules/admin/dto/contest-candidate-action.dto';
import { AdminContestReviewService } from './admin-contest-review.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminContestReviewController {
  constructor(
    private readonly adminContestReviewService: AdminContestReviewService,
  ) {}

  @Get('contests/review-queue')
  @ApiOperation({ summary: 'Get v2 contest winner review queue' })
  async getContestReviewQueue() {
    return this.adminContestReviewService.getContestReviewQueue();
  }

  @Post('contests/:contestId/candidates/:candidateId/approve')
  @ApiOperation({ summary: 'Approve a v2 contest winner candidate' })
  async approveContestCandidate(
    @Param('contestId', ParseIntPipe) contestId: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminContestReviewService.approveContestCandidate(
      contestId,
      candidateId,
      req.user.id,
    );
  }

  @Post('contests/:contestId/candidates/:candidateId/reject')
  @ApiOperation({ summary: 'Reject a v2 contest winner candidate' })
  async rejectContestCandidate(
    @Param('contestId', ParseIntPipe) contestId: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Body() dto: ContestCandidateRejectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminContestReviewService.rejectContestCandidate(
      contestId,
      candidateId,
      req.user.id,
      dto.reason ?? null,
    );
  }

  @Post('contests/:contestId/candidates/:candidateId/select')
  @ApiOperation({ summary: 'Select a v2 contest winner candidate for review' })
  async selectContestCandidate(
    @Param('contestId', ParseIntPipe) contestId: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminContestReviewService.selectContestCandidate(
      contestId,
      candidateId,
      req.user.id,
    );
  }

  @Post('contests/:contestId/no-winner')
  @ApiOperation({ summary: 'Mark a v2 contest as completed with no winner' })
  async markContestNoWinner(
    @Param('contestId', ParseIntPipe) contestId: number,
    @Body() dto: ContestNoWinnerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminContestReviewService.markContestNoWinner(
      contestId,
      req.user.id,
      dto.reason ?? null,
    );
  }
}
