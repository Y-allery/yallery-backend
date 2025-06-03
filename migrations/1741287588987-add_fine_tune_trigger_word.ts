import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFineTuneTriggerWord1741287588987 implements MigrationInterface {
  name = 'AddFineTuneTriggerWord1741287588987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`fineTuneTriggerWord\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`fineTuneTriggerWord\``,
    );
  }
}
