import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The job row behind `callback_url`: what was asked, what came back, and whether the
 * callback got there.
 *
 * Separate from `partner_api_usage` so the billing table stays a narrow, permanent ledger
 * while this one carries prunable payloads. Rows are written for synchronous calls as well,
 * which is what lets `GET /v1/jobs/{id}` answer for every call ever made.
 */
export class CreatePartnerJobs1786400000000 implements MigrationInterface {
  name = 'CreatePartnerJobs1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_jobs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`publicId\` varchar(40) NOT NULL,
        \`partnerKeyId\` int NOT NULL,
        \`accountId\` int NULL,
        \`usageId\` int NULL,
        \`heldUsd\` decimal(12,4) NOT NULL DEFAULT 0,
        \`capability\` varchar(32) NOT NULL,
        \`model\` varchar(64) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'queued',
        \`request\` json NOT NULL,
        \`result\` json NULL,
        \`errorType\` varchar(64) NULL,
        \`errorMessage\` varchar(500) NULL,
        \`callbackUrl\` varchar(2048) NULL,
        \`callbackStatus\` varchar(16) NOT NULL DEFAULT 'none',
        \`callbackDeliveryId\` varchar(40) NULL,
        \`callbackAttempts\` int NOT NULL DEFAULT 0,
        \`callbackLastStatus\` int NULL,
        \`callbackLastError\` varchar(255) NULL,
        \`deliveredAt\` timestamp NULL,
        \`startedAt\` timestamp NULL,
        \`finishedAt\` timestamp NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_partner_jobs_public_id\` (\`publicId\`),
        INDEX \`IDX_partner_jobs_key_created\` (\`partnerKeyId\`, \`createdAt\`),
        INDEX \`IDX_partner_jobs_account_created\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`partner_jobs\``);
  }
}
