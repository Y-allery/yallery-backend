import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAdminMetrics1764700700000 implements MigrationInterface {
  name = 'ExtendAdminMetrics1764700700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `totalPosts` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `totalImagePosts` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `totalVideoPosts` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `activeUsers` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `newLikes` int NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `totalLikes` int NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `totalLikes`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `newLikes`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `activeUsers`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `totalVideoPosts`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `totalImagePosts`',
    );
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `totalPosts`',
    );
  }
}


