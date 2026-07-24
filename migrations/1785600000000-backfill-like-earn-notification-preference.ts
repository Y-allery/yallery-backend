import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Someone liked your post, +N points" was effectively dark in production:
 * the push gate required a `notification_preferences` row, and rows are only
 * ever written when a user touches the toggle, so almost no account had one.
 *
 * The application now treats a missing LIKE_EARN row as enabled, and this
 * backfill materialises that for existing accounts so the settings screen and
 * every future read agree with the gate. Rows the users already wrote are left
 * untouched — an explicit opt-out (`enabled = 0`) must survive this.
 *
 * Written in id-ranged chunks so the insert never holds a long lock on
 * `notification_preferences` or scans `users` in one pass. At ~3.4k users this
 * is a handful of indexed statements.
 */
export class BackfillLikeEarnNotificationPreference1785600000000
  implements MigrationInterface
{
  name = 'BackfillLikeEarnNotificationPreference1785600000000';

  private static readonly BATCH_SIZE = 1000;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ maxUserId }] = await queryRunner.query(
      `SELECT COALESCE(MAX(\`id\`), 0) AS maxUserId FROM \`users\``,
    );

    const batchSize =
      BackfillLikeEarnNotificationPreference1785600000000.BATCH_SIZE;

    for (let fromId = 0; fromId < Number(maxUserId); fromId += batchSize) {
      const toId = fromId + batchSize;

      // NOT EXISTS keeps the re-run a no-op instead of burning auto-increment
      // ids; INSERT IGNORE additionally absorbs the unique-key collision if a
      // live request writes the same (userId, LIKE_EARN) pair while the deploy
      // migration is running, so a race cannot abort the deploy.
      await queryRunner.query(
        `INSERT IGNORE INTO \`notification_preferences\`
           (\`userId\`, \`activityType\`, \`enabled\`)
         SELECT u.\`id\`, 'LIKE_EARN', 1
         FROM \`users\` u
         WHERE u.\`id\` > ? AND u.\`id\` <= ?
           AND NOT EXISTS (
             SELECT 1 FROM \`notification_preferences\` np
             WHERE np.\`userId\` = u.\`id\`
               AND np.\`activityType\` = 'LIKE_EARN'
           )`,
        [fromId, toId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfilled rows are indistinguishable from a user's own opt-in (the table
    // has no timestamps), so the revert drops enabled LIKE_EARN rows and keeps
    // every opt-out. That is the safe asymmetry: losing an opt-in only returns
    // the account to the default, while losing an opt-out would push someone
    // who asked not to be pushed.
    await queryRunner.query(
      `DELETE FROM \`notification_preferences\`
       WHERE \`activityType\` = 'LIKE_EARN' AND \`enabled\` = 1`,
    );
  }
}
