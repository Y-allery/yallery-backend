import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsRejectedToPost1723463319013 implements MigrationInterface {
  name = 'AddIsRejectedToPost1723463319013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`is_rejected\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` DROP COLUMN \`is_rejected\``,
    );
  }
}
