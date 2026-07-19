import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_device_tokens had no timestamps, so there was no way to tell a token
 * registered this morning from one registered a year ago — which made it
 * impossible to diagnose push-delivery gaps or measure the effect of the
 * mobile re-registration fix.
 *
 * Existing rows are deliberately left NULL rather than backfilled with the
 * migration time: we genuinely do not know when they were registered, and a
 * fake "everything is fresh today" would be worse than an honest unknown.
 */
export class AddDeviceTokenTimestamps1784600000000
  implements MigrationInterface
{
  name = 'AddDeviceTokenTimestamps1784600000000';

  private async getColumnNames(queryRunner: QueryRunner): Promise<string[]> {
    const rows = await queryRunner.query(
      `SELECT COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_device_tokens'`,
    );
    return rows.map((row: { columnName: string }) => row.columnName);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await this.getColumnNames(queryRunner);

    if (!columns.includes('createdAt')) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\`
         ADD COLUMN \`createdAt\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }
    if (!columns.includes('updatedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\`
         ADD COLUMN \`updatedAt\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }

    // Tokens belonging to soft-deleted (blocked) users. The hard-delete path
    // clears them via FK CASCADE, but a soft delete leaves the user row in
    // place, so these accumulate as rows we can never deliver to.
    await queryRunner.query(
      `DELETE dt FROM \`user_device_tokens\` dt
       INNER JOIN \`users\` u ON u.id = dt.userId
       WHERE u.isDeleted = 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The deleted rows are not restorable, and re-adding them would recreate
    // undeliverable tokens; only the columns are reverted.
    const columns = await this.getColumnNames(queryRunner);

    if (columns.includes('updatedAt')) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\` DROP COLUMN \`updatedAt\``,
      );
    }
    if (columns.includes('createdAt')) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\` DROP COLUMN \`createdAt\``,
      );
    }
  }
}
