import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAdminMetricsV21764700800000 implements MigrationInterface {
  name = 'ExtendAdminMetricsV21764700800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `newContestPosts` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `newRegularPosts` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `avgLikesPerPost` float NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `avgLikesPerPost`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `newRegularPosts`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `newContestPosts`',
    );
  }
}


