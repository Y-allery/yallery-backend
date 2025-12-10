import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRewardsAddNewTypes1765328001000 implements MigrationInterface {
  name = 'UpdateRewardsAddNewTypes1765328001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Додаємо нові типи нагород
    const newRewards = [
      {
        reward_type: 'DAILY_LOGIN',
        points: 10,
        description: 'Daily login reward - claimable once per day',
        is_active: 1,
      },
      {
        reward_type: 'POST_VIDEO_REWARD',
        points: 50,
        description: 'Reward for publishing a video post - claimable once per day',
        is_active: 1,
      },
      {
        reward_type: 'POST_PHOTO_REWARD',
        points: 30,
        description: 'Reward for publishing a photo post - claimable once per day',
        is_active: 1,
      },
    ];

    for (const reward of newRewards) {
      const descriptionEscaped = reward.description
        ? reward.description.replace(/'/g, "\\'").replace(/"/g, '\\"')
        : null;

      // Перевіряємо чи не існує вже такий тип
      const existing = await queryRunner.query(`
        SELECT id FROM \`rewards\` WHERE \`reward_type\` = '${reward.reward_type}'
      `);

      if (existing.length === 0) {
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

    // Оновлюємо опис для DAILY_REWARD (залишаємо для зворотної сумісності)
    await queryRunner.query(`
      UPDATE \`rewards\` 
      SET \`description\` = 'Daily reward for active users (deprecated - use DAILY_LOGIN)' 
      WHERE \`reward_type\` = 'DAILY_REWARD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видаляємо нові типи нагород
    await queryRunner.query(`
      DELETE FROM \`rewards\` WHERE \`reward_type\` IN ('DAILY_LOGIN', 'POST_VIDEO_REWARD', 'POST_PHOTO_REWARD')
    `);

    // Відновлюємо опис для DAILY_REWARD
    await queryRunner.query(`
      UPDATE \`rewards\` 
      SET \`description\` = 'Daily reward for active users' 
      WHERE \`reward_type\` = 'DAILY_REWARD'
    `);
  }
}
