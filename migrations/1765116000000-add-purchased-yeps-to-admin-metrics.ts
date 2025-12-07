import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchasedYepsToAdminMetrics1765116000000
  implements MigrationInterface
{
  name = 'AddPurchasedYepsToAdminMetrics1765116000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` ADD `purchasedYeps7D` int NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `admin_metrics` DROP COLUMN `purchasedYeps7D`',
    );
  }
}
