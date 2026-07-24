import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The referral bonus minted points for both sides on redemption with no cap
 * and no proof the invited account was real, which is the cheapest thing to
 * farm ahead of a 50k-user launch.
 *
 * Three columns are needed to police it: `usedAt` (the daily cap needs the
 * redemption time — createdAt is when the *code* was made), and a payout
 * state plus timestamp so the referrer's half can be deferred until the
 * invited user actually generates something.
 *
 * Rows already redeemed are backfilled to 'paid': they were credited under the
 * old rules, and leaving them NULL would make the settlement sweep and the cap
 * counter treat historical referrals as unpaid work.
 */
export class AddReferralRewardTracking1785700000000
  implements MigrationInterface
{
  name = 'AddReferralRewardTracking1785700000000';

  private async getColumnNames(queryRunner: QueryRunner): Promise<string[]> {
    const rows = await queryRunner.query(
      `SELECT COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referrals'`,
    );
    return rows.map((row: { columnName: string }) => row.columnName);
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'referrals'
         AND INDEX_NAME = ?`,
      [indexName],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await this.getColumnNames(queryRunner);

    if (!columns.includes('usedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\`
         ADD COLUMN \`usedAt\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }
    if (!columns.includes('referrerRewardState')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\`
         ADD COLUMN \`referrerRewardState\` VARCHAR(16) NULL DEFAULT NULL`,
      );
    }
    if (!columns.includes('referrerRewardedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\`
         ADD COLUMN \`referrerRewardedAt\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }

    await queryRunner.query(
      `UPDATE \`referrals\`
       SET \`referrerRewardState\` = 'paid'
       WHERE \`usedById\` IS NOT NULL AND \`referrerRewardState\` IS NULL`,
    );

    if (!(await this.hasIndex(queryRunner, 'IDX_referrals_user_used_at'))) {
      await queryRunner.query(
        `CREATE INDEX \`IDX_referrals_user_used_at\`
         ON \`referrals\` (\`userId\`, \`usedAt\`)`,
      );
    }
    if (!(await this.hasIndex(queryRunner, 'IDX_referrals_reward_state'))) {
      await queryRunner.query(
        `CREATE INDEX \`IDX_referrals_reward_state\`
         ON \`referrals\` (\`referrerRewardState\`, \`id\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'IDX_referrals_reward_state')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_referrals_reward_state\` ON \`referrals\``,
      );
    }
    if (await this.hasIndex(queryRunner, 'IDX_referrals_user_used_at')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_referrals_user_used_at\` ON \`referrals\``,
      );
    }

    const columns = await this.getColumnNames(queryRunner);
    if (columns.includes('referrerRewardedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\` DROP COLUMN \`referrerRewardedAt\``,
      );
    }
    if (columns.includes('referrerRewardState')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\` DROP COLUMN \`referrerRewardState\``,
      );
    }
    if (columns.includes('usedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`referrals\` DROP COLUMN \`usedAt\``,
      );
    }
  }
}
