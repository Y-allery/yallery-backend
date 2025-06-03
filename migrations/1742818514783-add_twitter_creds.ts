import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwitterCreds1742818514783 implements MigrationInterface {
  name = 'AddTwitterCreds1742818514783';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`twitterCredentials\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`twitterCredentials\``,
    );
  }
}
