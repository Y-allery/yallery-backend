import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContestFlowV2Tables1769005300000
  implements MigrationInterface
{
  name = 'CreateContestFlowV2Tables1769005300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_flow_metadata\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`contestId\` int NOT NULL,
        \`flowVersion\` varchar(20) NOT NULL DEFAULT 'v2',
        \`lifecycleStatus\` varchar(40) NOT NULL DEFAULT 'scheduled',
        \`reviewStatus\` varchar(40) NOT NULL DEFAULT 'none',
        \`visibility\` varchar(20) NOT NULL DEFAULT 'public',
        \`reviewSnapshotAt\` timestamp NULL,
        UNIQUE INDEX \`IDX_contest_flow_metadata_contestId\` (\`contestId\`),
        INDEX \`IDX_contest_flow_metadata_lifecycleStatus\` (\`lifecycleStatus\`),
        INDEX \`IDX_contest_flow_metadata_reviewStatus\` (\`reviewStatus\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_contest_flow_metadata_contestId\`
          FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_submissions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`contestId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`postId\` int NULL,
        \`generationJobId\` varchar(160) NULL,
        \`submittedAt\` timestamp NOT NULL,
        \`completedAt\` timestamp NULL,
        \`mediaKind\` varchar(40) NOT NULL,
        \`aiSettingId\` int NULL,
        \`status\` varchar(40) NOT NULL DEFAULT 'accepted',
        \`eligibilityStatus\` varchar(80) NOT NULL DEFAULT 'eligible',
        INDEX \`IDX_contest_submissions_contestId\` (\`contestId\`),
        INDEX \`IDX_contest_submissions_userId\` (\`userId\`),
        INDEX \`IDX_contest_submissions_postId\` (\`postId\`),
        INDEX \`IDX_contest_submissions_generationJobId\` (\`generationJobId\`),
        INDEX \`IDX_contest_submissions_status\` (\`status\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_contest_submissions_contestId\`
          FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_submissions_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_submissions_postId\`
          FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_submissions_aiSettingId\`
          FOREIGN KEY (\`aiSettingId\`) REFERENCES \`media_ai_settings\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_winner_candidates\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`contestId\` int NOT NULL,
        \`submissionId\` int NULL,
        \`postId\` int NULL,
        \`userId\` int NULL,
        \`rank\` int NOT NULL,
        \`score\` float NOT NULL DEFAULT 0,
        \`scoreBreakdown\` json NULL,
        \`source\` varchar(40) NOT NULL,
        \`eligibilityStatus\` varchar(80) NOT NULL DEFAULT 'eligible',
        \`reviewStatus\` varchar(40) NOT NULL DEFAULT 'candidate',
        \`rejectionReason\` text NULL,
        INDEX \`IDX_contest_winner_candidates_contest_rank\` (\`contestId\`, \`rank\`),
        INDEX \`IDX_contest_winner_candidates_submissionId\` (\`submissionId\`),
        INDEX \`IDX_contest_winner_candidates_reviewStatus\` (\`reviewStatus\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_contest_winner_candidates_contestId\`
          FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_winner_candidates_submissionId\`
          FOREIGN KEY (\`submissionId\`) REFERENCES \`contest_submissions\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_winner_candidates_postId\`
          FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_winner_candidates_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_review_actions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`contestId\` int NOT NULL,
        \`candidateId\` int NULL,
        \`adminUserId\` int NULL,
        \`actionType\` varchar(60) NOT NULL,
        \`reason\` text NULL,
        \`metadata\` json NULL,
        INDEX \`IDX_contest_review_actions_contestId\` (\`contestId\`),
        INDEX \`IDX_contest_review_actions_actionType\` (\`actionType\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_contest_review_actions_contestId\`
          FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_review_actions_candidateId\`
          FOREIGN KEY (\`candidateId\`) REFERENCES \`contest_winner_candidates\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_review_actions_adminUserId\`
          FOREIGN KEY (\`adminUserId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_rewards\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`contestId\` int NOT NULL,
        \`candidateId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`postId\` int NOT NULL,
        \`points\` int NOT NULL DEFAULT 0,
        \`status\` varchar(40) NOT NULL DEFAULT 'pending',
        \`paidAt\` timestamp NULL,
        UNIQUE INDEX \`IDX_contest_rewards_contestId\` (\`contestId\`),
        INDEX \`IDX_contest_rewards_userId\` (\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_contest_rewards_contestId\`
          FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_rewards_candidateId\`
          FOREIGN KEY (\`candidateId\`) REFERENCES \`contest_winner_candidates\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_rewards_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_contest_rewards_postId\`
          FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `contest_rewards`');
    await queryRunner.query('DROP TABLE IF EXISTS `contest_review_actions`');
    await queryRunner.query('DROP TABLE IF EXISTS `contest_winner_candidates`');
    await queryRunner.query('DROP TABLE IF EXISTS `contest_submissions`');
    await queryRunner.query('DROP TABLE IF EXISTS `contest_flow_metadata`');
  }
}
