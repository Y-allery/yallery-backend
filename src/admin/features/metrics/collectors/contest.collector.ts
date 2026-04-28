import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';

@Injectable()
export class ContestMetricsCollector {
  constructor(
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async collectParticipants(periodStart: Date, periodEnd: Date) {
    const contestParticipantsStatsRaw = await this.contestRepository
      .createQueryBuilder('c')
      .leftJoin('c.participants', 'p')
      .select('c.id', 'contestId')
      .addSelect('c.name', 'contestName')
      .addSelect('COUNT(DISTINCT p.id)', 'participantsCount')
      .where(
        '(c.startTime >= :start OR c.endTime >= :start OR c.startTime <= :end)',
        {
          start: periodStart,
          end: periodEnd,
        },
      )
      .groupBy('c.id')
      .addGroupBy('c.name')
      .having('COUNT(DISTINCT p.id) > 0')
      .orderBy('COUNT(DISTINCT p.id)', 'DESC')
      .getRawMany();

    return contestParticipantsStatsRaw.map((row) => ({
      contestId: Number(row.contestId),
      contestName: row.contestName,
      participantsCount: Number(row.participantsCount || 0),
    }));
  }
}
