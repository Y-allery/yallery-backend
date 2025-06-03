import { MigrationInterface, QueryRunner } from 'typeorm';

export class HasWonDailyReward1733344348031 implements MigrationInterface {
  name = 'HasWonDailyReward1733344348031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` ADD \`hasWonDailyReward\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`posts\` DROP COLUMN \`hasWonDailyReward\``,
    );
  }
}
