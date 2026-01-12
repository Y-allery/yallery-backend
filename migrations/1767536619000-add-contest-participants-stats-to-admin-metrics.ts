import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContestParticipantsStatsToAdminMetrics1767536619000
  implements MigrationInterface
{
  name = 'AddContestParticipantsStatsToAdminMetrics1767536619000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `contestParticipantsStats` json NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `contestParticipantsStats`',
    );
  }
}





