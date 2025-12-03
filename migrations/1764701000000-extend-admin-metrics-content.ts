import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAdminMetricsContent1764701000000
  implements MigrationInterface
{
  name = 'ExtendAdminMetricsContent1764701000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `postsPerUserAvg7D` float NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `topTags7D` json NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `topTags7D`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `postsPerUserAvg7D`',
    );
  }
}


