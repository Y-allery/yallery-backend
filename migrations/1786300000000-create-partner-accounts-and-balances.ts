import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns the partner API into a self-service product: an account a customer signs into, a
 * prepaid USD balance, an append-only ledger, and keys that belong to an account.
 *
 * `partner_api_keys.accountId` is nullable and every key that exists today keeps NULL,
 * which means "internal key, no balance enforcement" — so the keys already issued to
 * ourselves keep working unchanged.
 */
export class CreatePartnerAccountsAndBalances1786300000000
  implements MigrationInterface
{
  name = 'CreatePartnerAccountsAndBalances1786300000000';

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS c
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?`,
      [table, column],
    );
    return Number(rows?.[0]?.c ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_accounts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(190) NOT NULL,
        \`passwordHash\` varchar(100) NOT NULL,
        \`company\` varchar(120) NULL,
        \`balanceUsd\` decimal(12,4) NOT NULL DEFAULT 0,
        \`isActive\` tinyint NOT NULL DEFAULT 1,
        \`lastLoginAt\` timestamp NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_partner_accounts_email\` (\`email\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_balance_transactions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`accountId\` int NOT NULL,
        \`kind\` varchar(16) NOT NULL,
        \`amountUsd\` decimal(12,4) NOT NULL,
        \`balanceAfterUsd\` decimal(12,4) NOT NULL,
        \`usageId\` int NULL,
        \`note\` varchar(255) NULL,
        \`createdByAdminId\` int NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_partner_balance_tx_account_created\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB
    `);

    if (!(await this.hasColumn(queryRunner, 'partner_api_keys', 'accountId'))) {
      await queryRunner.query(
        `ALTER TABLE \`partner_api_keys\` ADD \`accountId\` int NULL DEFAULT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX \`IDX_partner_api_keys_account\` ON \`partner_api_keys\` (\`accountId\`)`,
      );
    }

    if (!(await this.hasColumn(queryRunner, 'partner_api_keys', 'expiresAt'))) {
      await queryRunner.query(
        `ALTER TABLE \`partner_api_keys\` ADD \`expiresAt\` timestamp NULL DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'partner_api_keys', 'expiresAt')) {
      await queryRunner.query(
        `ALTER TABLE \`partner_api_keys\` DROP COLUMN \`expiresAt\``,
      );
    }
    if (await this.hasColumn(queryRunner, 'partner_api_keys', 'accountId')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_partner_api_keys_account\` ON \`partner_api_keys\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`partner_api_keys\` DROP COLUMN \`accountId\``,
      );
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`partner_balance_transactions\``,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS \`partner_accounts\``);
  }
}
