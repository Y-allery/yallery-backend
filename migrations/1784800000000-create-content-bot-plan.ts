import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContentBotPlan1784800000000 implements MigrationInterface {
  name = 'CreateContentBotPlan1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`content_bot_plan\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`planDate\` date NOT NULL,
        \`mediaKind\` varchar(20) NOT NULL,
        \`aiService\` varchar(80) NULL,
        \`tagId\` int NULL,
        \`promptTemplateKey\` varchar(120) NULL,
        \`promptText\` text NULL,
        \`negativePrompt\` text NULL,
        \`seed\` int NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'planned',
        \`isPreview\` tinyint(1) NOT NULL DEFAULT 0,
        \`taskId\` varchar(64) NULL,
        \`postId\` int NULL,
        \`failureReason\` varchar(255) NULL,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_content_bot_plan_status\` (\`status\`),
        INDEX \`IDX_content_bot_plan_plan_date\` (\`planDate\`),
        INDEX \`IDX_content_bot_plan_tag\` (\`tagId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `content_bot_plan`');
  }
}
