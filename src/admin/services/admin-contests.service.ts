import { Injectable, Logger } from '@nestjs/common';
import { CreateContestDto } from '../dto/create-contest.dto';
import { ForceStartContestDto } from '../dto/force-start-contest.dto';
import { GetTopPostDto } from '../dto/get-top-post.dto';
import { SetContestWinnerDto } from '../dto/set.contest.winner.dto';
import { ContestService } from 'src/contest/contest.service';
import { UpdateContestDto } from 'src/contest/dto/update.contest.dto';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';

@Injectable()
export class AdminContestsService {
  private readonly logger = new Logger(AdminContestsService.name);

  constructor(private readonly contestService: ContestService) {}

  async createAdminContest(data: CreateContestDto) {
    return this.contestService.createAdminContest(data);
  }

  async findAllContests(status: ContestStatusEnum) {
    return this.contestService.findContestsByStatus(status);
  }

  async updateContest(id: number, updateContestDto: UpdateContestDto) {
    return this.contestService.updateContest(id, updateContestDto);
  }

  async deleteContest(id: number) {
    return this.contestService.deleteContest(id);
  }

  async getPostsByContestSortedByLikes() {
    return this.contestService.getTopPostForEachContest();
  }

  async getTopContestPost(data: GetTopPostDto) {
    return this.contestService.getTopContestPost(data);
  }

  async setContestWinner(data: SetContestWinnerDto) {
    return this.contestService.setContestWinner(data);
  }

  async rejectContestWinner(data: SetContestWinnerDto) {
    return this.contestService.rejectContestWinner(data);
  }

  async forceStartContest(contestId: ForceStartContestDto['contestId']) {
    this.logger.log(`Force starting contest ID ${contestId}`);
    try {
      const contest = await this.contestService.findContestById(contestId);

      if (!contest) {
        this.logger.warn(`Contest with ID ${contestId} not found`);
        return {
          success: false,
          message: 'Contest not found',
          timestamp: new Date().toISOString(),
        };
      }

      if (contest.status === ContestStatusEnum.OPEN) {
        this.logger.warn(`Contest with ID ${contestId} is already active`);
        return {
          success: false,
          message: 'Contest is already active',
          timestamp: new Date().toISOString(),
        };
      }

      const currentTime = new Date();
      contest.status = ContestStatusEnum.OPEN;
      contest.startTime = currentTime;
      contest.isApproved = false;

      await this.contestService.updateContest(contestId, {
        status: ContestStatusEnum.OPEN,
        start_time: currentTime,
        end_time: contest.endTime,
      });

      await this.contestService.sendContestStartNotifications(contest);

      this.logger.log(`Contest "${contest.name}" force started successfully`);
      return {
        success: true,
        message: `Contest "${contest.name}" has been force started successfully`,
        contestId: contest.id,
        contestName: contest.name,
        startTime: currentTime.toISOString(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Force start contest error:`, error.message);
      return {
        success: false,
        message: 'Failed to force start contest',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
