import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserRewardsTable1765328000000 implements MigrationInterface {
  name = 'CreateUserRewardsTable1765328000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_rewards\``);
  }
}
