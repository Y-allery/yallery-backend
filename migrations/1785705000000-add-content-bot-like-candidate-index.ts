import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The content bot's like tick scans "visible posts newer than X" every 10
 * minutes. The existing composite indexes all lead with tagId or userId, so
 * that query had no usable access path and fell back to scanning posts — a
 * cost that grows with the launch. This index matches its equality prefix plus
 * the createdAt range exactly.
 */
export class AddContentBotLikeCandidateIndex1785705000000
  implements MigrationInterface
{
  name = 'AddContentBotLikeCandidateIndex1785705000000';

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
    const postsIndexes = await this.getIndexNames(queryRunner, 'posts');

    if (!postsIndexes.includes('idx_posts_visible_created')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_visible_created\`
         ON \`posts\` (\`isPublished\`, \`isBlocked\`, \`isRejected\`, \`createdAt\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const postsIndexes = await this.getIndexNames(queryRunner, 'posts');

    if (postsIndexes.includes('idx_posts_visible_created')) {
      await queryRunner.query(
        `DROP INDEX \`idx_posts_visible_created\` ON \`posts\``,
      );
    }
  }
}
