import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModifyActivityTypeEnum1733346190438 implements MigrationInterface {
  name = 'ModifyActivityTypeEnum1733346190438';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON', 'TOP_POST_REWARD') NOT NULL DEFAULT 'LIKE_EARN'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notification_preferences\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON', 'TOP_POST_REWARD') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`notification_preferences\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON') NOT NULL DEFAULT 'LIKE_EARN'`,
    );
  }
}
