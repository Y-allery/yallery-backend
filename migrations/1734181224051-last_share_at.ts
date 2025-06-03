import { MigrationInterface, QueryRunner } from 'typeorm';

export class LastShareAt1734181224051 implements MigrationInterface {
  name = 'LastShareAt1734181224051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`lastShareRewardAt\` timestamp NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`lastShareRewardAt\``,
    );
  }
}
