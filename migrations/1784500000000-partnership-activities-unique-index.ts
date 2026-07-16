import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnershipActivitiesUniqueIndex1784500000000
  implements MigrationInterface
{
  name = 'PartnershipActivitiesUniqueIndex1784500000000';

  private async getIndexNames(queryRunner: QueryRunner): Promise<string[]> {
    const rows = await queryRunner.query(
      `SELECT DISTINCT INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'partnership_activities'`,
    );
    return rows.map((row: { indexName: string }) => row.indexName);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const indexNames = await this.getIndexNames(queryRunner);

    // The logger's check-then-insert dedupe was racy and could persist
    // duplicate (userId, partnershipId, activity) rows. Remove them — keeping
    // the lowest id per triple — so the UNIQUE index (which lets the logger
    // use a single race-free bulk INSERT IGNORE) can be created.
    if (!indexNames.includes('IDX_pa_user_partnership_activity_uq')) {
      await queryRunner.query(`
        DELETE p1 FROM \`partnership_activities\` p1
        INNER JOIN \`partnership_activities\` p2
          ON p1.\`userId\` = p2.\`userId\`
         AND p1.\`partnershipId\` = p2.\`partnershipId\`
         AND p1.\`activity\` = p2.\`activity\`
         AND p1.\`id\` > p2.\`id\`
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`IDX_pa_user_partnership_activity_uq\`
         ON \`partnership_activities\` (\`userId\`, \`partnershipId\`, \`activity\`)`,
      );
    }

    // The old non-unique index is fully covered by the unique one.
    if (
      indexNames.includes(
        'idx_partnership_activities_user_partnership_activity',
      )
    ) {
      await queryRunner.query(
        `DROP INDEX \`idx_partnership_activities_user_partnership_activity\`
         ON \`partnership_activities\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexNames = await this.getIndexNames(queryRunner);

    if (
      !indexNames.includes(
        'idx_partnership_activities_user_partnership_activity',
      )
    ) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partnership_activities_user_partnership_activity\`
         ON \`partnership_activities\` (\`userId\`, \`partnershipId\`, \`activity\`)`,
      );
    }

    if (indexNames.includes('IDX_pa_user_partnership_activity_uq')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_pa_user_partnership_activity_uq\`
         ON \`partnership_activities\``,
      );
    }
  }
}
