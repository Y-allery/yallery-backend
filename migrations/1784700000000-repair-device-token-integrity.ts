import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_device_tokens had no constraints at all — no unique key, no index, and
 * (despite the entity declaring onDelete: CASCADE) no foreign key in the
 * database. Three consequences, all measured on prod before this ran:
 *
 *  - 283 of 802 rows were orphans: deleting an account left its tokens behind,
 *    because the CASCADE only ever existed in the entity metadata.
 *  - 130 rows were duplicate tokens. A token identifies an app install, so the
 *    same device was registered under several accounts — one token was bound
 *    to 19 different users, meaning that phone received all 19 accounts' pushes.
 *  - Registration was a read-then-write with nothing to serialize it, so
 *    concurrent registrations could and did create duplicate rows.
 *
 * Cleanup keeps the newest row per token (highest id): the device belongs to
 * whoever registered it last.
 */
export class RepairDeviceTokenIntegrity1784700000000
  implements MigrationInterface
{
  name = 'RepairDeviceTokenIntegrity1784700000000';

  private async indexExists(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user_device_tokens'
         AND INDEX_NAME = ?
       LIMIT 1`,
      [indexName],
    );
    return rows.length > 0;
  }

  private async foreignKeyExists(
    queryRunner: QueryRunner,
    constraintName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user_device_tokens'
         AND CONSTRAINT_NAME = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       LIMIT 1`,
      [constraintName],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Orphans first: the foreign key below cannot be created while rows
    // point at users that no longer exist.
    await queryRunner.query(
      `DELETE dt FROM \`user_device_tokens\` dt
       LEFT JOIN \`users\` u ON u.id = dt.userId
       WHERE dt.userId IS NULL OR u.id IS NULL`,
    );

    // 2. Collapse duplicate tokens, keeping the most recent registration.
    await queryRunner.query(
      `DELETE t1 FROM \`user_device_tokens\` t1
       INNER JOIN \`user_device_tokens\` t2
         ON t1.token = t2.token
        AND t1.id < t2.id`,
    );

    // 3. One row per token, enforced by the database rather than by a
    // read-then-write that races with itself.
    if (!(await this.indexExists(queryRunner, 'IDX_device_tokens_token'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`IDX_device_tokens_token\`
         ON \`user_device_tokens\` (\`token\`)`,
      );
    }

    // 4. Every push lookup filters by userId.
    if (!(await this.indexExists(queryRunner, 'IDX_device_tokens_user'))) {
      await queryRunner.query(
        `CREATE INDEX \`IDX_device_tokens_user\`
         ON \`user_device_tokens\` (\`userId\`)`,
      );
    }

    // 5. The CASCADE the entity always claimed to have.
    if (!(await this.foreignKeyExists(queryRunner, 'FK_device_tokens_user'))) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\`
         ADD CONSTRAINT \`FK_device_tokens_user\`
         FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`)
         ON DELETE CASCADE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deleted orphans and duplicates are not restorable — recreating them
    // would only recreate undeliverable and cross-account rows.
    if (await this.foreignKeyExists(queryRunner, 'FK_device_tokens_user')) {
      await queryRunner.query(
        `ALTER TABLE \`user_device_tokens\`
         DROP FOREIGN KEY \`FK_device_tokens_user\``,
      );
    }
    if (await this.indexExists(queryRunner, 'IDX_device_tokens_user')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_device_tokens_user\` ON \`user_device_tokens\``,
      );
    }
    if (await this.indexExists(queryRunner, 'IDX_device_tokens_token')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_device_tokens_token\` ON \`user_device_tokens\``,
      );
    }
  }
}
