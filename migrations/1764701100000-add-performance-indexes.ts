import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1764701100000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1764701100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. likes таблиця - критичні індекси для EXISTS підзапитів
    await queryRunner.query(
      `CREATE INDEX \`idx_likes_postId\` ON \`likes\` (\`postId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_likes_userId\` ON \`likes\` (\`userId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_likes_post_user\` ON \`likes\` (\`postId\`, \`userId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_likes_createdAt\` ON \`likes\` (\`createdAt\`)`,
    );

    // 2. viewed_posts таблиця - критичні індекси для EXISTS підзапитів
    await queryRunner.query(
      `CREATE INDEX \`idx_viewed_posts_post_user\` ON \`viewed_posts\` (\`postId\`, \`userId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_viewed_posts_postId\` ON \`viewed_posts\` (\`postId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_viewed_posts_userId\` ON \`viewed_posts\` (\`userId\`)`,
    );

    // 3. posts таблиця - індекси для фільтрації по даті та умовах
    await queryRunner.query(
      `CREATE INDEX \`idx_posts_createdAt\` ON \`posts\` (\`createdAt\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_posts_published_blocked_created\` ON \`posts\` (\`is_published\`, \`is_blocked\`, \`createdAt\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_posts_contest_published_created\` ON \`posts\` (\`contestId\`, \`is_published\`, \`is_blocked\`, \`createdAt\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_posts_published_blocked_id\` ON \`posts\` (\`is_published\`, \`is_blocked\`, \`id\` DESC)`,
    );

    // 4. users таблиця - індекс для фільтрації по даті
    await queryRunner.query(
      `CREATE INDEX \`idx_users_createdAt\` ON \`users\` (\`createdAt\`)`,
    );

    // 5. users_tags_tags таблиця - індекси для many-to-many зв'язків
    await queryRunner.query(
      `CREATE INDEX \`idx_users_tags_user\` ON \`users_tags_tags\` (\`usersId\`, \`tagsId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_users_tags_tag\` ON \`users_tags_tags\` (\`tagsId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видалення індексів в зворотному порядку
    await queryRunner.query(`DROP INDEX \`idx_users_tags_tag\` ON \`users_tags_tags\``);
    await queryRunner.query(`DROP INDEX \`idx_users_tags_user\` ON \`users_tags_tags\``);
    await queryRunner.query(`DROP INDEX \`idx_users_createdAt\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`idx_posts_published_blocked_id\` ON \`posts\``);
    await queryRunner.query(`DROP INDEX \`idx_posts_contest_published_created\` ON \`posts\``);
    await queryRunner.query(`DROP INDEX \`idx_posts_published_blocked_created\` ON \`posts\``);
    await queryRunner.query(`DROP INDEX \`idx_posts_createdAt\` ON \`posts\``);
    await queryRunner.query(`DROP INDEX \`idx_viewed_posts_userId\` ON \`viewed_posts\``);
    await queryRunner.query(`DROP INDEX \`idx_viewed_posts_postId\` ON \`viewed_posts\``);
    await queryRunner.query(`DROP INDEX \`idx_viewed_posts_post_user\` ON \`viewed_posts\``);
    await queryRunner.query(`DROP INDEX \`idx_likes_createdAt\` ON \`likes\``);
    await queryRunner.query(`DROP INDEX \`idx_likes_post_user\` ON \`likes\``);
    await queryRunner.query(`DROP INDEX \`idx_likes_userId\` ON \`likes\``);
    await queryRunner.query(`DROP INDEX \`idx_likes_postId\` ON \`likes\``);
  }
}

