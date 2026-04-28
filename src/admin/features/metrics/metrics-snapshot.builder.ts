import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminMetricsEntity } from '../../entities/admin-metrics.entity';
import { AIUsageMetricsCollector } from './collectors/ai-usage.collector';
import { ContestMetricsCollector } from './collectors/contest.collector';
import { PaymentMetricsCollector } from './collectors/payment.collector';
import { PostMetricsCollector } from './collectors/post.collector';

@Injectable()
export class MetricsSnapshotBuilder {
  constructor(
    @InjectRepository(AdminMetricsEntity)
    private readonly adminMetricsRepository: Repository<AdminMetricsEntity>,
    private readonly aiUsageMetricsCollector: AIUsageMetricsCollector,
    private readonly contestMetricsCollector: ContestMetricsCollector,
    private readonly paymentMetricsCollector: PaymentMetricsCollector,
    private readonly postMetricsCollector: PostMetricsCollector,
  ) {}

  async buildAndSave() {
    const now = new Date();
    const periodEnd = new Date(now.getTime());
    const periodStart = new Date(
      periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    const [postStats, aiStats, purchasedYeps7D, contestParticipantsStats] =
      await Promise.all([
        this.postMetricsCollector.collect(periodStart, periodEnd),
        this.aiUsageMetricsCollector.collect(periodStart, periodEnd),
        this.paymentMetricsCollector.collectPurchasedYeps(
          periodStart,
          periodEnd,
        ),
        this.contestMetricsCollector.collectParticipants(periodStart, periodEnd),
      ]);

    const snapshot = this.adminMetricsRepository.create({
      periodStart,
      periodEnd,
      ...postStats,
      aiStats,
      purchasedYeps7D,
      contestParticipantsStats,
    });

    return this.adminMetricsRepository.save(snapshot);
  }
}
