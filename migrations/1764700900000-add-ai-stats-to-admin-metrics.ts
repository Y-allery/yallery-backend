import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiStatsToAdminMetrics1764700900000
  implements MigrationInterface
{
  name = 'AddAiStatsToAdminMetrics1764700900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `aiStats` json NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `aiStats`',
    );
  }
}


