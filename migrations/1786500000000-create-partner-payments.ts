import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Card payments for the partner API: a saved card, an auto top-up rule, and a record of
 * every attempt to charge it.
 *
 * All of it hangs off `partner_accounts`, which has no foreign key into any Yallery table
 * and gains none here — the whole partner set stays liftable into its own database on the
 * day it needs one.
 */
export class CreatePartnerPayments1786500000000 implements MigrationInterface {
  name = 'CreatePartnerPayments1786500000000';

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

  private readonly columns: Array<[string, string]> = [
    ['stripeCustomerId', 'varchar(64) NULL DEFAULT NULL'],
    ['paymentMethodId', 'varchar(64) NULL DEFAULT NULL'],
    ['paymentMethodBrand', 'varchar(24) NULL DEFAULT NULL'],
    ['paymentMethodLast4', 'char(4) NULL DEFAULT NULL'],
    ['autoRechargeEnabled', 'tinyint NOT NULL DEFAULT 0'],
    ['autoRechargeThresholdUsd', 'decimal(12,4) NULL DEFAULT NULL'],
    ['autoRechargeAmountUsd', 'decimal(12,4) NULL DEFAULT NULL'],
    ['rechargeInFlight', 'tinyint NOT NULL DEFAULT 0'],
    ['autoRechargeFailures', 'int NOT NULL DEFAULT 0'],
    ['autoRechargeDisabledReason', 'varchar(255) NULL DEFAULT NULL'],
    ['lastRechargeAt', 'timestamp NULL DEFAULT NULL'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, definition] of this.columns) {
      if (!(await this.hasColumn(queryRunner, 'partner_accounts', column))) {
        await queryRunner.query(
          `ALTER TABLE \`partner_accounts\` ADD \`${column}\` ${definition}`,
        );
      }
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`partner_payments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`accountId\` int NOT NULL,
        \`stripeEventId\` varchar(80) NULL,
        \`paymentIntentId\` varchar(80) NULL,
        \`checkoutSessionId\` varchar(120) NULL,
        \`amountUsd\` decimal(12,4) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'pending',
        \`kind\` varchar(16) NOT NULL,
        \`failureCode\` varchar(120) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_partner_payments_event\` (\`stripeEventId\`),
        INDEX \`IDX_partner_payments_account_created\` (\`accountId\`, \`createdAt\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`partner_payments\``);
    for (const [column] of this.columns) {
      if (await this.hasColumn(queryRunner, 'partner_accounts', column)) {
        await queryRunner.query(
          `ALTER TABLE \`partner_accounts\` DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
