import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdditionalPerformanceIndexes1764701200000
  implements MigrationInterface
{
  name = 'AddAdditionalPerformanceIndexes1764701200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. activity таблиця - критичні індекси для foreign keys та фільтрації
    // Перевіряємо чи індекси вже існують перед створенням
    const activityIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'activity'
    `);
    const existingActivityIndexes = activityIndexes.map((idx: any) => idx.INDEX_NAME);

    if (!existingActivityIndexes.includes('idx_activity_to_user')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_to_user\` ON \`activity\` (\`to_user_id\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_from_user')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_from_user\` ON \`activity\` (\`from_user_id\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_contest')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_contest\` ON \`activity\` (\`contest_id\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_post')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_post\` ON \`activity\` (\`post_id\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_createdAt')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_createdAt\` ON \`activity\` (\`createdAt\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_isRead')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_isRead\` ON \`activity\` (\`isRead\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_to_user_read')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_to_user_read\` ON \`activity\` (\`to_user_id\`, \`isRead\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_to_user_type')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_to_user_type\` ON \`activity\` (\`to_user_id\`, \`activityType\`)`,
      );
    }
    if (!existingActivityIndexes.includes('idx_activity_to_user_created')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_activity_to_user_created\` ON \`activity\` (\`to_user_id\`, \`createdAt\`)`,
      );
    }

    // 2. posts таблиця - індекси на foreign keys та часто використовувані колонки
    const postsIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'posts'
    `);
    const existingPostsIndexes = postsIndexes.map((idx: any) => idx.INDEX_NAME);

    if (!existingPostsIndexes.includes('idx_posts_tagId')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_tagId\` ON \`posts\` (\`tagId\`)`,
      );
    }
    if (!existingPostsIndexes.includes('idx_posts_userId')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_userId\` ON \`posts\` (\`userId\`)`,
      );
    }
    if (!existingPostsIndexes.includes('idx_posts_delivered')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_delivered\` ON \`posts\` (\`is_delivered\`)`,
      );
    }
    if (!existingPostsIndexes.includes('idx_posts_user_delivered')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_posts_user_delivered\` ON \`posts\` (\`userId\`, \`is_delivered\`)`,
      );
    }

    // 3. users таблиця - UNIQUE індекс на email (якщо відсутній)
    const usersIndexes = await queryRunner.query(`
      SELECT INDEX_NAME, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'email'
    `);
    const hasUniqueEmailIndex = usersIndexes.some(
      (idx: any) => idx.NON_UNIQUE === 0,
    );
    if (!hasUniqueEmailIndex) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`idx_users_email\` ON \`users\` (\`email\`)`,
      );
    }

    // 4. partnership_activities таблиця - індекси для пошуку
    const partnershipActivitiesIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'partnership_activities'
    `);
    const existingPartnershipActivitiesIndexes = partnershipActivitiesIndexes.map(
      (idx: any) => idx.INDEX_NAME,
    );

    if (!existingPartnershipActivitiesIndexes.includes('idx_partnership_activities_user')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partnership_activities_user\` ON \`partnership_activities\` (\`userId\`)`,
      );
    }
    if (!existingPartnershipActivitiesIndexes.includes('idx_partnership_activities_partnership')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partnership_activities_partnership\` ON \`partnership_activities\` (\`partnershipId\`)`,
      );
    }
    if (!existingPartnershipActivitiesIndexes.includes('idx_partnership_activities_user_partnership_activity')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partnership_activities_user_partnership_activity\` ON \`partnership_activities\` (\`userId\`, \`partnershipId\`, \`activity\`)`,
      );
    }

    // 5. partner_user_links таблиця - індекс на userId (якщо відсутній)
    const partnerUserLinksIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'partner_user_links'
    `);
    const existingPartnerUserLinksIndexes = partnerUserLinksIndexes.map(
      (idx: any) => idx.INDEX_NAME,
    );

    if (!existingPartnerUserLinksIndexes.includes('idx_partner_user_links_user')) {
      await queryRunner.query(
        `CREATE INDEX \`idx_partner_user_links_user\` ON \`partner_user_links\` (\`userId\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видалення індексів в зворотному порядку
    await queryRunner.query(
      `DROP INDEX \`idx_partner_user_links_user\` ON \`partner_user_links\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_partnership_activities_user_partnership_activity\` ON \`partnership_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_partnership_activities_partnership\` ON \`partnership_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_partnership_activities_user\` ON \`partnership_activities\``,
    );
    await queryRunner.query(`DROP INDEX \`idx_users_email\` ON \`users\``);
    await queryRunner.query(
      `DROP INDEX \`idx_posts_user_delivered\` ON \`posts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_posts_delivered\` ON \`posts\``,
    );
    await queryRunner.query(`DROP INDEX \`idx_posts_userId\` ON \`posts\``);
    await queryRunner.query(`DROP INDEX \`idx_posts_tagId\` ON \`posts\``);
    await queryRunner.query(
      `DROP INDEX \`idx_activity_to_user_created\` ON \`activity\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_activity_to_user_type\` ON \`activity\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_activity_to_user_read\` ON \`activity\``,
    );
    await queryRunner.query(`DROP INDEX \`idx_activity_isRead\` ON \`activity\``);
    await queryRunner.query(
      `DROP INDEX \`idx_activity_createdAt\` ON \`activity\``,
    );
    await queryRunner.query(`DROP INDEX \`idx_activity_post\` ON \`activity\``);
    await queryRunner.query(
      `DROP INDEX \`idx_activity_contest\` ON \`activity\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_activity_from_user\` ON \`activity\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_activity_to_user\` ON \`activity\``,
    );
  }
}

