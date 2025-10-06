import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendPartnershipSourceEnum1759828820000 implements MigrationInterface {
  name = 'ExtendPartnershipSourceEnum1759828820000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Expand enum values to include 'web app'
    await queryRunner.query(
      "ALTER TABLE `partnerships` MODIFY `source` ENUM('mini app','regular app','web app') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert enum values (NOTE: this will fail if rows exist with 'web app')
    // Safer approach: map 'web app' to 'regular app' before shrinking the enum
    await queryRunner.query(
      "UPDATE `partnerships` SET `source` = 'regular app' WHERE `source` = 'web app'",
    );
    await queryRunner.query(
      "ALTER TABLE `partnerships` MODIFY `source` ENUM('mini app','regular app') NOT NULL",
    );
  }
}


