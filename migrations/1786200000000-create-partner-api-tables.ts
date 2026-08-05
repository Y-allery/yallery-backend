import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Storage for the public generation API sold to third parties.
 *
 * `partner_api_keys` holds only a SHA-256 of the key, so a database leak yields no working
 * credential; `partner_api_usage` records the partner price and our own cost per call,
 * both frozen at call time because the catalog's numbers move and an invoice re-derived
 * from today's prices would silently restate last month.
 */
export class CreatePartnerApiTables1786200000000 implements MigrationInterface {
  name = 'CreatePartnerApiTables1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_api_keys\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(120) NOT NULL,
        \`keyHash\` char(64) NOT NULL,
        \`keyPrefix\` varchar(16) NOT NULL,
        \`isActive\` tinyint NOT NULL DEFAULT 1,
        \`rateLimitPerMinute\` int NULL,
        \`lastUsedAt\` timestamp NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_partner_api_keys_hash\` (\`keyHash\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_api_usage\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`partnerKeyId\` int NOT NULL,
        \`model\` varchar(64) NOT NULL,
        \`capability\` varchar(32) NOT NULL,
        \`backend\` varchar(16) NOT NULL,
        \`priceUsd\` decimal(10,5) NOT NULL,
        \`costUsd\` decimal(10,5) NOT NULL,
        \`executionMs\` int NOT NULL,
        \`status\` varchar(16) NOT NULL,
        \`failureCode\` varchar(64) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_partner_api_usage_key_created\` (\`partnerKeyId\`, \`createdAt\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`partner_api_usage\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`partner_api_keys\``);
  }
}
