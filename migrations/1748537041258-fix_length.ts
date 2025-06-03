import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTelegramIdType1748537041258 implements MigrationInterface {
  name = 'FixTelegramIdType1748537041258';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`telegramId\` \`telegramId\` BIGINT UNSIGNED NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`telegramId\` \`telegramId\` INT NULL`,
    );
  }
}
