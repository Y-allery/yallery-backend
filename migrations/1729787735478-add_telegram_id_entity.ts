import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramIdEntity1729787735478 implements MigrationInterface {
  name = 'AddTelegramIdEntity1729787735478';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`telegramId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD UNIQUE INDEX \`IDX_df18d17f84763558ac84192c75\` (\`telegramId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP INDEX \`IDX_df18d17f84763558ac84192c75\``,
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`telegramId\``);
  }
}
