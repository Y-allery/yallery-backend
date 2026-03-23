import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMediaGenerationRequestsAndDeliveries1769120000000
  implements MigrationInterface
{
  name = 'CreateMediaGenerationRequestsAndDeliveries1769120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`media_generation_requests\` (
        \`id\` varchar(36) NOT NULL,
        \`userId\` int NOT NULL,
        \`modality\` varchar(32) NOT NULL,
        \`provider\` varchar(32) NOT NULL,
        \`providerJobId\` varchar(191) NULL,
        \`status\` varchar(32) NOT NULL,
        \`requestPayload\` json NOT NULL,
        \`responsePayload\` json NULL,
        \`errorCode\` varchar(64) NULL,
        \`errorMessage\` text NULL,
        \`startedAt\` timestamp(6) NULL,
        \`completedAt\` timestamp(6) NULL,
        \`failedAt\` timestamp(6) NULL,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_media_generation_requests_userId\` (\`userId\`),
        INDEX \`IDX_media_generation_requests_modality\` (\`modality\`),
        INDEX \`IDX_media_generation_requests_status\` (\`status\`),
        INDEX \`IDX_media_generation_requests_providerJobId\` (\`providerJobId\`),
        CONSTRAINT \`FK_media_generation_requests_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE \`media_generation_deliveries\` (
        \`id\` varchar(36) NOT NULL,
        \`requestId\` varchar(36) NOT NULL,
        \`userId\` int NOT NULL,
        \`eventType\` varchar(64) NOT NULL,
        \`payload\` json NOT NULL,
        \`isDelivered\` tinyint NOT NULL DEFAULT 0,
        \`deliveredAt\` timestamp(6) NULL,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_media_generation_deliveries_requestId\` (\`requestId\`),
        INDEX \`IDX_media_generation_deliveries_userId\` (\`userId\`),
        INDEX \`IDX_media_generation_deliveries_eventType\` (\`eventType\`),
        INDEX \`IDX_media_generation_deliveries_isDelivered\` (\`isDelivered\`),
        CONSTRAINT \`FK_media_generation_deliveries_request\` FOREIGN KEY (\`requestId\`) REFERENCES \`media_generation_requests\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_media_generation_deliveries_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `media_generation_deliveries` DROP FOREIGN KEY `FK_media_generation_deliveries_request`',
    );
    await queryRunner.query(
      'ALTER TABLE `media_generation_deliveries` DROP FOREIGN KEY `FK_media_generation_deliveries_user`',
    );
    await queryRunner.query(
      'ALTER TABLE `media_generation_requests` DROP FOREIGN KEY `FK_media_generation_requests_user`',
    );
    await queryRunner.query('DROP TABLE `media_generation_deliveries`');
    await queryRunner.query('DROP TABLE `media_generation_requests`');
  }
}
