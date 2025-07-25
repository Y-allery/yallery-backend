import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActivityEnumToVarchar1751107245688 implements MigrationInterface {
  name = 'ActivityEnumToVarchar1751107245688';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` RENAME COLUMN \`activityType\` TO \`activityType_old\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` ADD \`activityType\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE \`activity\` SET \`activityType\` = \`activityType_old\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP COLUMN \`activityType_old\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` RENAME COLUMN \`activityType\` TO \`activityType_old\``,
    );
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      ADD \`activityType\` ENUM(
        'LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE',
        'CONTEST_OPEN', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD',
        'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW',
        'ADMIN_CONTEST_WON', 'TOP_POST_REWARD_AUTHOR', 'TOP_POST_REWARD_LIKER'
      ) NOT NULL DEFAULT 'LIKE_EARN'
    `);
    await queryRunner.query(
      `UPDATE \`activity\` SET \`activityType\` = \`activityType_old\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP COLUMN \`activityType_old\``,
    );
  }
}
