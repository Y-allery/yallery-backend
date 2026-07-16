import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeedPerformanceIndexes1784200000000
  implements MigrationInterface
{
  name = 'AddFeedPerformanceIndexes1784200000000';

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
    // 1. viewed_posts: UNIQUE (userId, postId) lets mark-viewed use a single
    // bulk INSERT IGNORE instead of read-then-write, and closes the race that
    // could create duplicate view rows (same pattern as IDX_likes_user_post).
    // Existing duplicates are removed first, keeping the lowest id per pair.
    const viewedUniqueIndexes = await queryRunner.query(
      `SELECT INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'viewed_posts'
         AND NON_UNIQUE = 0
         AND COLUMN_NAME IN ('userId', 'postId')
       GROUP BY INDEX_NAME
       HAVING COUNT(DISTINCT COLUMN_NAME) = 2`,
    );

    if (viewedUniqueIndexes.length === 0) {
      await queryRunner.query(`
        DELETE v1 FROM \`viewed_posts\` v1
        INNER JOIN \`viewed_posts\` v2
          ON v1.\`userId\` = v2.\`userId\`
         AND v1.\`postId\` = v2.\`postId\`
         AND v1.\`id\` > v2.\`id\`
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`IDX_viewed_posts_user_post\`
         ON \`viewed_posts\` (\`userId\`, \`postId\`)`,
      );
    }

    const postsIndexes = await this.getIndexNames(queryRunner, 'posts');

    // 2. Covers GET /post/get-posts-by-tag: equality filters + createdAt sort.
    if (!postsIndexes.includes('idx_posts_tag_pub_created')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_tag_pub_created\`
         ON \`posts\` (\`tagId\`, \`isPublished\`, \`isBlocked\`, \`isRejected\`, \`createdAt\`)`,
      );
    }

    // 3. Covers GET /post/published and /post/unpublished profile lists.
    if (!postsIndexes.includes('idx_posts_user_pub_created')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_user_pub_created\`
         ON \`posts\` (\`userId\`, \`isPublished\`, \`createdAt\`)`,
      );
    }

    // 4. /auth/refresh and reset/change-email flows look users up by these
    // tokens; without indexes each lookup is a full users scan.
    const usersIndexes = await this.getIndexNames(queryRunner, 'users');
    if (!usersIndexes.includes('idx_users_refreshToken')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_users_refreshToken\` ON \`users\` (\`refreshToken\`)`,
      );
    }
    if (!usersIndexes.includes('idx_users_resetToken')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_users_resetToken\` ON \`users\` (\`resetToken\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersIndexes = await this.getIndexNames(queryRunner, 'users');
    if (usersIndexes.includes('idx_users_resetToken')) {
      await queryRunner.query(
        `DROP INDEX \`idx_users_resetToken\` ON \`users\``,
      );
    }
    if (usersIndexes.includes('idx_users_refreshToken')) {
      await queryRunner.query(
        `DROP INDEX \`idx_users_refreshToken\` ON \`users\``,
      );
    }

    const postsIndexes = await this.getIndexNames(queryRunner, 'posts');
    if (postsIndexes.includes('idx_posts_user_pub_created')) {
      await queryRunner.query(
        `DROP INDEX \`idx_posts_user_pub_created\` ON \`posts\``,
      );
    }
    if (postsIndexes.includes('idx_posts_tag_pub_created')) {
      await queryRunner.query(
        `DROP INDEX \`idx_posts_tag_pub_created\` ON \`posts\``,
      );
    }

    const viewedIndexes = await this.getIndexNames(queryRunner, 'viewed_posts');
    if (viewedIndexes.includes('IDX_viewed_posts_user_post')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_viewed_posts_user_post\` ON \`viewed_posts\``,
      );
    }
  }
}
