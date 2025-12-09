import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRewardsTable1765318000000 implements MigrationInterface {
  name = 'CreateRewardsTable1765318000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`rewards\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`reward_type\` varchar(255) NOT NULL,
        \`points\` int NOT NULL,
        \`description\` text NULL,
        \`is_active\` tinyint NOT NULL DEFAULT '1',
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_reward_type\` (\`reward_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Вставляємо початкові значення нагород
    const rewards = [
      {
        reward_type: 'DAILY_REWARD',
        points: 10,
        description: 'Daily reward for active users',
        is_active: 1,
      },
      {
        reward_type: 'LIKE_EARN',
        points: 5,
        description: 'Points earned when someone likes your post',
        is_active: 1,
      },
      {
        reward_type: 'LIKE_SPEND',
        points: 15,
        description: 'Points spent to like a post',
        is_active: 1,
      },
      {
        reward_type: 'SHARE_REWARD',
        points: 500,
        description: 'Reward for inviting new users (referral)',
        is_active: 1,
      },
      {
        reward_type: 'SHARE_YEPS',
        points: 5,
        description: 'Reward for sharing a post',
        is_active: 1,
      },
      {
        reward_type: 'TOP_POST_REWARD_AUTHOR',
        points: 100,
        description: 'Reward for author of the most liked post in a tag',
        is_active: 1,
      },
      {
        reward_type: 'TOP_POST_REWARD_LIKER',
        points: 0,
        description: 'Dynamic reward for likers of top post (calculated per post)',
        is_active: 1,
      },
      {
        reward_type: 'PAYMENT_5000',
        points: 5000,
        description: 'Points purchased: 5000 YEPs package',
        is_active: 1,
      },
      {
        reward_type: 'PAYMENT_15000',
        points: 15000,
        description: 'Points purchased: 15000 YEPs package',
        is_active: 1,
      },
      {
        reward_type: 'PAYMENT_30000',
        points: 30000,
        description: 'Points purchased: 30000 YEPs package',
        is_active: 1,
      },
      {
        reward_type: 'REFERRAL_REWARD',
        points: 500,
        description: 'Reward for both users when referral code is used',
        is_active: 1,
      },
      {
        reward_type: 'TWITTER_USERNAME_UPDATE_REWARD',
        points: 200,
        description: 'Reward for updating Twitter username',
        is_active: 1,
      },
      {
        reward_type: 'EMAIL_UPDATE_REWARD',
        points: 100,
        description: 'Reward for updating email address',
        is_active: 1,
      },
      {
        reward_type: 'REGISTRATION_BONUS',
        points: 3000,
        description: 'Initial points bonus for new user registration',
        is_active: 1,
      },
    ];

    for (const reward of rewards) {
      const descriptionEscaped = reward.description
        ? reward.description.replace(/'/g, "\\'").replace(/"/g, '\\"')
        : null;

      await queryRunner.query(`
        INSERT INTO \`rewards\` (
          \`reward_type\`, \`points\`, \`description\`, \`is_active\`
        ) VALUES (
          '${reward.reward_type}',
          ${reward.points},
          ${descriptionEscaped ? `'${descriptionEscaped}'` : 'NULL'},
          ${reward.is_active}
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`rewards\``);
  }
}
