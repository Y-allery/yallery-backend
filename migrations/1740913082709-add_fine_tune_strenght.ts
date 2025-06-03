import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFineTuneStrenght1740913082709 implements MigrationInterface {
  name = 'AddFineTuneStrenght1740913082709';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`fineTuneStrength\` int NULL DEFAULT '1'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`fineTuneStrength\``,
    );
  }
}
