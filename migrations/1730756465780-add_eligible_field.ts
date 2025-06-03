import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEligibleField1730756465780 implements MigrationInterface {
  name = 'AddEligibleField1730756465780';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`bonusEligible\` tinyint NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`bonusEligible\``,
    );
  }
}
