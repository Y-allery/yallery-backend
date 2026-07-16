import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContestIndexes1784400000000 implements MigrationInterface {
  name = 'AddContestIndexes1784400000000';

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
    const contestsIndexes = await this.getIndexNames(queryRunner, 'contests');

    // Contest lists, the status cron and the winners ranking CTE all filter
    // contests by status.
    if (!contestsIndexes.includes('idx_contests_status')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_contests_status\` ON \`contests\` (\`status\`)`,
      );
    }

    // Lifecycle transitions compare startTime/endTime windows on every sweep.
    if (!contestsIndexes.includes('idx_contests_start_end')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_contests_start_end\` ON \`contests\` (\`startTime\`, \`endTime\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const contestsIndexes = await this.getIndexNames(queryRunner, 'contests');

    if (contestsIndexes.includes('idx_contests_start_end')) {
      await queryRunner.query(
        `DROP INDEX \`idx_contests_start_end\` ON \`contests\``,
      );
    }
    if (contestsIndexes.includes('idx_contests_status')) {
      await queryRunner.query(
        `DROP INDEX \`idx_contests_status\` ON \`contests\``,
      );
    }
  }
}
