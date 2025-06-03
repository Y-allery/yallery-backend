import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromptExmapleField1744378396175 implements MigrationInterface {
  name = 'PromptExmapleField1744378396175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` ADD \`prompt_example\` text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contests\` DROP COLUMN \`prompt_example\``,
    );
  }
}
