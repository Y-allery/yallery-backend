import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsEmailVerifyedAndVerificationToken1732129506019
  implements MigrationInterface
{
  name = 'AddIsEmailVerifyedAndVerificationToken1732129506019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`emailVerified\` tinyint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`verificationToken\` varchar(255) NULL UNIQUE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`verificationToken\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`emailVerified\``,
    );
  }
}
