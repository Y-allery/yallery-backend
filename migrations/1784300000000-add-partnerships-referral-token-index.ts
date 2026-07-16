import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartnershipsReferralTokenIndex1784300000000
  implements MigrationInterface
{
  name = 'AddPartnershipsReferralTokenIndex1784300000000';

  private async getIndexNames(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<string[]> {
    const rows = await queryRunner.query(
      `SELECT DISTINCT INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return rows.map((row: { indexName: string }) => row.indexName);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Public /partner/* routes look partnerships up by referralToken on every
    // call; without this index each lookup full-scans the table. Non-unique on
    // purpose so legacy duplicate tokens cannot fail the deploy.
    const indexes = await this.getIndexNames(queryRunner, 'partnerships');
    if (!indexes.includes('idx_partnerships_referralToken')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partnerships_referralToken\`
         ON \`partnerships\` (\`referralToken\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = await this.getIndexNames(queryRunner, 'partnerships');
    if (indexes.includes('idx_partnerships_referralToken')) {
      await queryRunner.query(
        `DROP INDEX \`idx_partnerships_referralToken\` ON \`partnerships\``,
      );
    }
  }
}
