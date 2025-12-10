import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsDailyToRewards1765328002000 implements MigrationInterface {
  name = 'AddIsDailyToRewards1765328002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Додаємо колонку is_daily
    await queryRunner.query(`
      ALTER TABLE \`rewards\`
      ADD COLUMN \`is_daily\` tinyint NOT NULL DEFAULT 0
    `);

    // Позначаємо щоденні нагороди
    await queryRunner.query(`
      UPDATE \`rewards\`
      SET \`is_daily\` = 1
      WHERE \`reward_type\` IN ('DAILY_LOGIN', 'POST_VIDEO_REWARD', 'POST_PHOTO_REWARD', 'DAILY_REWARD')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`rewards\`
      DROP COLUMN \`is_daily\`
    `);
  }
}
