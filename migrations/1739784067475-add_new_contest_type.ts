import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewContestType1739784067475 implements MigrationInterface {
  name = 'AddNewContestType1739784067475';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`fineTuneToken\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`contestType\` enum ('DEFAULT', 'FINE_TUNE') NOT NULL DEFAULT 'DEFAULT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`contestType\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`fineTuneToken\``,
    );
  }
}
