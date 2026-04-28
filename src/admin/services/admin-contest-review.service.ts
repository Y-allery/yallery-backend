import { Injectable } from '@nestjs/common';
import { ContestFlowService } from 'src/contest/contest-flow.service';

@Injectable()
export class AdminContestReviewService {
  constructor(private readonly contestFlowService: ContestFlowService) {}

  async getContestReviewQueue() {
    return this.contestFlowService.getReviewQueue();
  }

  async approveContestCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
  ) {
    return this.contestFlowService.approveCandidate(
      contestId,
      candidateId,
      adminUserId ?? null,
    );
  }

  async rejectContestCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
    reason?: string | null,
  ) {
    return this.contestFlowService.rejectCandidate(
      contestId,
      candidateId,
      adminUserId ?? null,
      reason ?? null,
    );
  }

  async selectContestCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
  ) {
    return this.contestFlowService.selectCandidate(
      contestId,
      candidateId,
      adminUserId ?? null,
    );
  }

  async markContestNoWinner(
    contestId: number,
    adminUserId?: number | null,
    reason?: string | null,
  ) {
    return this.contestFlowService.markNoWinner(
      contestId,
      adminUserId ?? null,
      reason ?? null,
    );
  }
}
