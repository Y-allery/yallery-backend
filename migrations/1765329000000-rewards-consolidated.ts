import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidated rewards migration for dev:
 * - Creates rewards table with is_daily flag
 * - Seeds current reward set (no DAILY_REWARD, no payment/video generate rewards)
 * - Creates user_rewards table with unique per-user/day constraint
 */
export class RewardsConsolidated1765329000000 implements MigrationInterface {
  name = 'RewardsConsolidated1765329000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`rewards\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`reward_type\` varchar(255) NOT NULL,
        \`points\` int NOT NULL,
        \`description\` text NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`is_daily\` tinyint NOT NULL DEFAULT 0,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_reward_type\` (\`reward_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const rewards = [
      {
        reward_type: 'DAILY_LOGIN',
        points: 10,
        description: 'Daily login reward - claimable once per day',
        is_active: 1,
        is_daily: 1,
      },
      {
        reward_type: 'POST_VIDEO_REWARD',
        points: 50,
        description: 'Reward for publishing a video post - claimable once per day',
        is_active: 1,
        is_daily: 1,
      },
      {
        reward_type: 'POST_PHOTO_REWARD',
        points: 30,
        description: 'Reward for publishing a photo post - claimable once per day',
        is_active: 1,
        is_daily: 1,
      },
      {
        reward_type: 'LIKE_EARN',
        points: 5,
        description: 'Points earned when someone likes your post',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'LIKE_SPEND',
        points: 15,
        description: 'Points spent to like a post',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'SHARE_REWARD',
        points: 500,
        description: 'Reward for inviting new users (referral)',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'SHARE_YEPS',
        points: 5,
        description: 'Reward for sharing a post',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'REFERRAL_REWARD',
        points: 500,
        description: 'Reward for both users when referral code is used',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'REGISTRATION_BONUS',
        points: 500,
        description: 'Initial points bonus for new user registration',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'REGISTRATION_REWARD',
        points: 0,
        description: 'Base reward for app install/registration (auto-claimed)',
        is_active: 1,
        is_daily: 0,
      },
      {
        reward_type: 'CONTEST_PARTICIPATION',
        points: 100,
        description: 'Reward for participating in a contest (one-time)',
        is_active: 1,
        is_daily: 0,
      },
    ];

    for (const reward of rewards) {
      const descriptionEscaped = reward.description
        ? reward.description.replace(/'/g, "\\'").replace(/"/g, '\\"')
        : null;

      await queryRunner.query(`
        INSERT INTO \`rewards\` (
          \`reward_type\`, \`points\`, \`description\`, \`is_active\`, \`is_daily\`
        ) VALUES (
          '${reward.reward_type}',
          ${reward.points},
          ${descriptionEscaped ? `'${descriptionEscaped}'` : 'NULL'},
          ${reward.is_active},
          ${reward.is_daily}
        )
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_rewards\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NOT NULL,
        \`rewardType\` varchar(255) NOT NULL,
        \`eligibleDate\` date NOT NULL,
        \`claimedDate\` date NULL,
        \`pointsAwarded\` int NULL,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_user_reward_eligible\` (\`userId\`, \`rewardType\`, \`eligibleDate\`),
        KEY \`IDX_userId\` (\`userId\`),
        KEY \`IDX_rewardType\` (\`rewardType\`),
        KEY \`IDX_eligibleDate\` (\`eligibleDate\`),
        CONSTRAINT \`FK_user_rewards_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `user_rewards`');
    await queryRunner.query('DROP TABLE IF EXISTS `rewards`');
  }
}
