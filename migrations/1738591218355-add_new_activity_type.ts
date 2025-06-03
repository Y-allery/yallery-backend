import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewActivityType1738591218355 implements MigrationInterface {
  name = 'AddNewActivityType1738591218355';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_OPEN', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON', 'TOP_POST_REWARD_AUTHOR', 'TOP_POST_REWARD_LIKER') NOT NULL DEFAULT 'LIKE_EARN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`activity\` CHANGE \`activityType\` \`activityType\` enum ('LIKE_EARN', 'LIKE_SPEND', 'IMAGE_GENERATE_SPEND', 'CONTEST_CLOSE', 'CONTEST_WIN', 'DAILY_REWARD', 'SHARE_REWARD', 'ADMIN_REPORT', 'ADMIN_CONTEST_REVIEW', 'ADMIN_REPORT_REVIEW', 'ADMIN_CONTEST_WON', 'TOP_POST_REWARD_AUTHOR', 'TOP_POST_REWARD_LIKER') NOT NULL DEFAULT 'LIKE_EARN'`,
    );
  }
}
