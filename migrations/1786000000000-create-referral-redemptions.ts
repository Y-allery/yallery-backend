import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splits redemptions out of `referrals` so one code can be redeemed by many people.
 *
 * The old shape put `usedById` on the code itself, so a link shared into a group chat
 * worked exactly once and everyone after the first got "already used".
 *
 * The legacy columns are deliberately left in place. Nothing writes them after this,
 * but keeping them means the deploy is reversible without data loss, and the backfill
 * below can be re-derived if anything looks wrong.
 */
export class CreateReferralRedemptions1786000000000
  implements MigrationInterface
{
  name = 'CreateReferralRedemptions1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(
      `SELECT COUNT(*) AS c
         FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'referral_redemptions'`,
    );
    if (Number(existing?.[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `CREATE TABLE \`referral_redemptions\` (
           \`id\` INT NOT NULL AUTO_INCREMENT,
           \`referralId\` INT NOT NULL,
           \`redeemedById\` INT NOT NULL,
           \`redeemedAt\` TIMESTAMP NOT NULL,
           \`rewardState\` VARCHAR(16) NULL DEFAULT NULL,
           \`rewardedAt\` TIMESTAMP NULL DEFAULT NULL,
           PRIMARY KEY (\`id\`),
           UNIQUE KEY \`UQ_referral_redemptions_redeemed_by\` (\`redeemedById\`),
           KEY \`IDX_referral_redemptions_referral\` (\`referralId\`),
           KEY \`IDX_referral_redemptions_reward_state\` (\`rewardState\`, \`id\`),
           CONSTRAINT \`FK_referral_redemptions_referral\`
             FOREIGN KEY (\`referralId\`) REFERENCES \`referrals\` (\`id\`) ON DELETE CASCADE,
           CONSTRAINT \`FK_referral_redemptions_user\`
             FOREIGN KEY (\`redeemedById\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      );
    }

    // Every already-redeemed code becomes one redemption row, so the daily/lifetime caps
    // keep counting past redemptions and the settlement sweep keeps its pending queue.
    //
    // usedAt is NULL for rows redeemed before the reward policy shipped; those fall back
    // to the code's createdAt. They are old enough that the daily-cap window is
    // unaffected, and a NOT NULL timestamp keeps the cap query free of special cases.
    //
    // INSERT IGNORE plus the unique key makes the re-run a no-op. It also silently drops
    // the second row where one user somehow redeemed two codes under the old scheme —
    // which the new unique constraint forbids anyway.
    await queryRunner.query(
      `INSERT IGNORE INTO \`referral_redemptions\`
         (\`referralId\`, \`redeemedById\`, \`redeemedAt\`, \`rewardState\`, \`rewardedAt\`)
       SELECT r.\`id\`,
              r.\`usedById\`,
              COALESCE(r.\`usedAt\`, r.\`createdAt\`),
              r.\`referrerRewardState\`,
              r.\`referrerRewardedAt\`
         FROM \`referrals\` r
         JOIN \`users\` u ON u.\`id\` = r.\`usedById\`
        WHERE r.\`usedById\` IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The legacy columns were never stopped being readable, so dropping the table is
    // enough to put the old code path back exactly where it was.
    await queryRunner.query(`DROP TABLE IF EXISTS \`referral_redemptions\``);
  }
}
