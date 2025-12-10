import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeactivateLegacyDailyReward1765328003000
  implements MigrationInterface
{
  name = 'DeactivateLegacyDailyReward1765328003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Робимо старий DAILY_REWARD неактивним і не daily
    await queryRunner.query(`
      UPDATE \`rewards\`
      SET \`is_active\` = 0, \`is_daily\` = 0
      WHERE \`reward_type\` = 'DAILY_REWARD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`rewards\`
      SET \`is_active\` = 1, \`is_daily\` = 1
      WHERE \`reward_type\` = 'DAILY_REWARD'
    `);
  }
}
