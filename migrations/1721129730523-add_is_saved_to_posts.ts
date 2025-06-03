import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsSavedToPosts1721129730523 implements MigrationInterface {
  name = 'AddIsSavedToPosts1721129730523';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`is_saved\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`is_saved\``);
  }
}
