import { MigrationInterface, QueryRunner } from 'typeorm';

export class StandardizeColumnNamesToCamelcase1765400000000
  implements MigrationInterface
{
  name = 'StandardizeColumnNamesToCamelcase1765400000000';

  // Helper function to safely drop index
  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    try {
      const indexExists = await queryRunner.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND INDEX_NAME = '${indexName}'
      `);

      if (indexExists[0].count > 0) {
        await queryRunner.query(`
          ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`
        `);
      }
    } catch (error) {
      // Index doesn't exist or already dropped, continue
      console.log(`Index ${indexName} on ${tableName} doesn't exist or already dropped`);
    }
  }

  // Helper function to check if column exists
  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    try {
      const result = await queryRunner.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND COLUMN_NAME = '${columnName}'
      `);
      return result[0].count > 0;
    } catch (error) {
      return false;
    }
  }

  // Helper function to safely rename column
  private async renameColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
    columnDefinition: string,
  ): Promise<void> {
    const exists = await this.columnExists(queryRunner, tableName, oldColumnName);
    if (exists) {
      await queryRunner.query(`
        ALTER TABLE \`${tableName}\` 
        CHANGE COLUMN \`${oldColumnName}\` \`${newColumnName}\` ${columnDefinition}
      `);
    } else {
      console.log(`Column ${oldColumnName} on ${tableName} doesn't exist, skipping rename`);
    }
  }

  // Helper function to safely create index
  private async createIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columns: string,
  ): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND INDEX_NAME = '${indexName}'
    `);

    if (exists[0].count === 0) {
      await queryRunner.query(`
        CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})
      `);
    } else {
      console.log(`Index ${indexName} on ${tableName} already exists, skipping creation`);
    }
  }

  // Helper function to safely create unique index
  private async createUniqueIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columns: string,
  ): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND INDEX_NAME = '${indexName}'
    `);

    if (exists[0].count === 0) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})
      `);
    } else {
      console.log(`Unique index ${indexName} on ${tableName} already exists, skipping creation`);
    }
  }

  // Helper function to safely drop foreign key
  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<void> {
    try {
      const fkExists = await queryRunner.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND CONSTRAINT_NAME = '${constraintName}'
      `);

      if (fkExists[0].count > 0) {
        await queryRunner.query(`
          ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\`
        `);
      }
    } catch (error) {
      // Foreign key doesn't exist or already dropped, continue
      console.log(`Foreign key ${constraintName} on ${tableName} doesn't exist or already dropped`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. POSTS TABLE
    // ============================================
    
    // Drop indexes that reference columns we're renaming
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_published_blocked_id');
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_contest_published_created');
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_published_blocked_created');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_9940eadb862fdda6a6a64a13a3');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_e7a92e0b265b6521c8f77c2cf0');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_3ff3ff6ea134f3c785a32fb2fc');

    // Rename columns in posts table
    await this.renameColumnIfExists(queryRunner, 'posts', 'is_published', 'isPublished', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'posts', 'is_saved', 'isSaved', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'posts', 'is_blocked', 'isBlocked', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'posts', 'is_rejected', 'isRejected', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'posts', 'is_delivered', 'isDelivered', 'tinyint NOT NULL DEFAULT \'1\'');
    await this.renameColumnIfExists(queryRunner, 'posts', 'generation_params', 'generationParams', 'JSON NULL');

    // Recreate indexes with new column names
    await this.createIndexIfNotExists(queryRunner, 'posts', 'IDX_posts_isPublished', '`isPublished`');
    await this.createIndexIfNotExists(queryRunner, 'posts', 'IDX_posts_isBlocked', '`isBlocked`');
    await this.createIndexIfNotExists(queryRunner, 'posts', 'IDX_posts_isRejected', '`isRejected`');
    await this.createIndexIfNotExists(queryRunner, 'posts', 'idx_posts_published_blocked_created', '`isPublished`, `isBlocked`, `createdAt`');
    await this.createIndexIfNotExists(queryRunner, 'posts', 'idx_posts_contest_published_created', '`contestId`, `isPublished`, `isBlocked`, `createdAt`');
    await this.createIndexIfNotExists(queryRunner, 'posts', 'idx_posts_published_blocked_id', '`isPublished`, `isBlocked`, `id` DESC');

    // ============================================
    // 2. USERS TABLE
    // ============================================
    await this.renameColumnIfExists(queryRunner, 'users', 'is_deleted', 'isDeleted', 'tinyint NOT NULL DEFAULT \'0\'');

    // ============================================
    // 3. CONTESTS TABLE
    // ============================================
    await this.renameColumnIfExists(queryRunner, 'contests', 'is_approved', 'isApproved', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'contests', 'prompt_example', 'promptExample', 'text NULL');
    // Note: start_time and end_time already have mapping in entity, but we'll rename them too for consistency
    await this.renameColumnIfExists(queryRunner, 'contests', 'start_time', 'startTime', 'timestamp NOT NULL');
    await this.renameColumnIfExists(queryRunner, 'contests', 'end_time', 'endTime', 'timestamp NOT NULL');

    // ============================================
    // 4. ACTIVITY TABLE
    // ============================================
    
    // Drop old foreign key constraints first
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_624114671c34d2515ec04c2c88c');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_86544031c5cb89dea77b32cede1');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_e592673989138da18babffdef7e');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_e67eeb490f1a183c27d92d06dfe');

    // Clean up invalid foreign key references BEFORE renaming columns
    // Check which column names exist (old or new)
    const contestIdColumnExists = await this.columnExists(queryRunner, 'activity', 'contest_id');
    const contestIdColumnNewExists = await this.columnExists(queryRunner, 'activity', 'contestId');
    const postIdColumnExists = await this.columnExists(queryRunner, 'activity', 'post_id');
    const postIdColumnNewExists = await this.columnExists(queryRunner, 'activity', 'postId');
    const fromUserIdColumnExists = await this.columnExists(queryRunner, 'activity', 'from_user_id');
    const fromUserIdColumnNewExists = await this.columnExists(queryRunner, 'activity', 'fromUserId');
    const toUserIdColumnExists = await this.columnExists(queryRunner, 'activity', 'to_user_id');
    const toUserIdColumnNewExists = await this.columnExists(queryRunner, 'activity', 'toUserId');

    // Use appropriate column names based on what exists
    const contestIdCol = contestIdColumnNewExists ? 'contestId' : (contestIdColumnExists ? 'contest_id' : null);
    const postIdCol = postIdColumnNewExists ? 'postId' : (postIdColumnExists ? 'post_id' : null);
    const fromUserIdCol = fromUserIdColumnNewExists ? 'fromUserId' : (fromUserIdColumnExists ? 'from_user_id' : null);
    const toUserIdCol = toUserIdColumnNewExists ? 'toUserId' : (toUserIdColumnExists ? 'to_user_id' : null);

    // Set NULL for contestId that don't exist in contests table
    if (contestIdCol) {
      await queryRunner.query(`
        UPDATE \`activity\` a
        LEFT JOIN \`contests\` c ON a.\`${contestIdCol}\` = c.id
        SET a.\`${contestIdCol}\` = NULL
        WHERE a.\`${contestIdCol}\` IS NOT NULL AND c.id IS NULL
      `);
    }
    
    // Set NULL for postId that don't exist in posts table
    if (postIdCol) {
      await queryRunner.query(`
        UPDATE \`activity\` a
        LEFT JOIN \`posts\` p ON a.\`${postIdCol}\` = p.id
        SET a.\`${postIdCol}\` = NULL
        WHERE a.\`${postIdCol}\` IS NOT NULL AND p.id IS NULL
      `);
    }
    
    // Set NULL for fromUserId that don't exist in users table
    if (fromUserIdCol) {
      await queryRunner.query(`
        UPDATE \`activity\` a
        LEFT JOIN \`users\` u ON a.\`${fromUserIdCol}\` = u.id
        SET a.\`${fromUserIdCol}\` = NULL
        WHERE a.\`${fromUserIdCol}\` IS NOT NULL AND u.id IS NULL
      `);
    }
    
    // Delete activities with invalid toUserId (toUserId is NOT NULL and required)
    if (toUserIdCol) {
      await queryRunner.query(`
        DELETE a FROM \`activity\` a
        LEFT JOIN \`users\` u ON a.\`${toUserIdCol}\` = u.id
        WHERE a.\`${toUserIdCol}\` IS NOT NULL AND u.id IS NULL
      `);
    }

    // Now rename columns
    await this.renameColumnIfExists(queryRunner, 'activity', 'is_admin', 'isAdmin', 'tinyint NOT NULL DEFAULT \'0\'');
    // Note: from_user_id, to_user_id, contest_id, post_id already have mapping in entity
    // but we'll rename them for consistency
    await this.renameColumnIfExists(queryRunner, 'activity', 'from_user_id', 'fromUserId', 'int NULL');
    await this.renameColumnIfExists(queryRunner, 'activity', 'to_user_id', 'toUserId', 'int NOT NULL');
    await this.renameColumnIfExists(queryRunner, 'activity', 'contest_id', 'contestId', 'int NULL');
    await this.renameColumnIfExists(queryRunner, 'activity', 'post_id', 'postId', 'int NULL');

    // Recreate foreign keys with new column names (only if columns exist)
    const finalContestIdCol = contestIdColumnNewExists ? 'contestId' : (contestIdColumnExists ? 'contest_id' : null);
    const finalPostIdCol = postIdColumnNewExists ? 'postId' : (postIdColumnExists ? 'post_id' : null);
    const finalFromUserIdCol = fromUserIdColumnNewExists ? 'fromUserId' : (fromUserIdColumnExists ? 'from_user_id' : null);
    const finalToUserIdCol = toUserIdColumnNewExists ? 'toUserId' : (toUserIdColumnExists ? 'to_user_id' : null);

    // Only create foreign keys if columns exist
    if (finalPostIdCol) {
      await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_postId');
      try {
        await queryRunner.query(`
          ALTER TABLE \`activity\` 
          ADD CONSTRAINT \`FK_activity_postId\` FOREIGN KEY (\`${finalPostIdCol}\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE
        `);
      } catch (error) {
        console.log(`Failed to create FK_activity_postId, may already exist: ${error.message}`);
      }
    }
    
    if (finalFromUserIdCol) {
      await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_fromUserId');
      try {
        await queryRunner.query(`
          ALTER TABLE \`activity\` 
          ADD CONSTRAINT \`FK_activity_fromUserId\` FOREIGN KEY (\`${finalFromUserIdCol}\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
        `);
      } catch (error) {
        console.log(`Failed to create FK_activity_fromUserId, may already exist: ${error.message}`);
      }
    }
    
    if (finalContestIdCol) {
      await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_contestId');
      try {
        await queryRunner.query(`
          ALTER TABLE \`activity\` 
          ADD CONSTRAINT \`FK_activity_contestId\` FOREIGN KEY (\`${finalContestIdCol}\`) REFERENCES \`contests\`(\`id\`) ON DELETE CASCADE
        `);
      } catch (error) {
        console.log(`Failed to create FK_activity_contestId, may already exist: ${error.message}`);
      }
    }
    
    if (finalToUserIdCol) {
      await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_toUserId');
      try {
        await queryRunner.query(`
          ALTER TABLE \`activity\` 
          ADD CONSTRAINT \`FK_activity_toUserId\` FOREIGN KEY (\`${finalToUserIdCol}\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
        `);
      } catch (error) {
        console.log(`Failed to create FK_activity_toUserId, may already exist: ${error.message}`);
      }
    }

    // Drop old indexes and recreate
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_86544031c5cb89dea77b32cede1');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_e67eeb490f1a183c27d92d06dfe');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_624114671c34d2515ec04c2c88c');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_e592673989138da18babffdef7e');

    // Create indexes with appropriate column names
    if (finalFromUserIdCol) {
      await this.createIndexIfNotExists(queryRunner, 'activity', 'FK_activity_fromUserId', `\`${finalFromUserIdCol}\``);
    }
    if (finalToUserIdCol) {
      await this.createIndexIfNotExists(queryRunner, 'activity', 'FK_activity_toUserId', `\`${finalToUserIdCol}\``);
    }
    if (finalPostIdCol) {
      await this.createIndexIfNotExists(queryRunner, 'activity', 'FK_activity_postId', `\`${finalPostIdCol}\``);
    }
    if (finalContestIdCol) {
      await this.createIndexIfNotExists(queryRunner, 'activity', 'FK_activity_contestId', `\`${finalContestIdCol}\``);
    }

    // ============================================
    // 5. AI_SETTINGS TABLE
    // ============================================
    await this.dropIndexIfExists(queryRunner, 'ai_settings', 'IDX_ai_service');
    
    await this.renameColumnIfExists(queryRunner, 'ai_settings', 'ai_service', 'aiService', 'varchar(255) NOT NULL');
    await this.renameColumnIfExists(queryRunner, 'ai_settings', 'api_model', 'apiModel', 'varchar(255) NULL');
    await this.renameColumnIfExists(queryRunner, 'ai_settings', 'is_artem', 'isArtem', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'ai_settings', 'is_active', 'isActive', 'tinyint NOT NULL DEFAULT \'1\'');

    await this.createUniqueIndexIfNotExists(queryRunner, 'ai_settings', 'IDX_ai_settings_aiService', '`aiService`');

    // ============================================
    // 6. AI_PROCESSOR_MAPPING TABLE
    // ============================================
    await this.dropIndexIfExists(queryRunner, 'ai_processor_mapping', 'IDX_ai_processor_mapping_ai_service');

    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'ai_service', 'aiService', 'varchar(255) NOT NULL');
    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'processor_type', 'processorType', 'enum(\'fal_ai\',\'x_router\',\'custom\') NOT NULL');
    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'queue_name', 'queueName', 'varchar(255) NULL');
    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'lock_duration', 'lockDuration', 'int NOT NULL DEFAULT \'120000\'');
    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'is_edit', 'isEdit', 'tinyint NOT NULL DEFAULT \'0\'');
    await this.renameColumnIfExists(queryRunner, 'ai_processor_mapping', 'completed_notification_param', 'completedNotificationParam', 'tinyint NULL');

    await this.createUniqueIndexIfNotExists(queryRunner, 'ai_processor_mapping', 'IDX_ai_processor_mapping_aiService', '`aiService`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse all changes in reverse order

    // AI_PROCESSOR_MAPPING
    await this.dropIndexIfExists(queryRunner, 'ai_processor_mapping', 'IDX_ai_processor_mapping_aiService');
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`aiService\` \`ai_service\` varchar(255) NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`processorType\` \`processor_type\` enum('fal_ai','x_router','custom') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`queueName\` \`queue_name\` varchar(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`lockDuration\` \`lock_duration\` int NOT NULL DEFAULT '120000'
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`isEdit\` \`is_edit\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_processor_mapping\` 
      CHANGE COLUMN \`completedNotificationParam\` \`completed_notification_param\` tinyint NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_ai_processor_mapping_ai_service\` ON \`ai_processor_mapping\` (\`ai_service\`)
    `);

    // AI_SETTINGS
    await this.dropIndexIfExists(queryRunner, 'ai_settings', 'IDX_ai_settings_aiService');
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      CHANGE COLUMN \`aiService\` \`ai_service\` varchar(255) NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      CHANGE COLUMN \`apiModel\` \`api_model\` varchar(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      CHANGE COLUMN \`isArtem\` \`is_artem\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      CHANGE COLUMN \`isActive\` \`is_active\` tinyint NOT NULL DEFAULT '1'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`IDX_ai_service\` ON \`ai_settings\` (\`ai_service\`)
    `);

    // ACTIVITY
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_activity_contestId');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_activity_postId');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_activity_toUserId');
    await this.dropIndexIfExists(queryRunner, 'activity', 'FK_activity_fromUserId');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_toUserId');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_contestId');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_fromUserId');
    await this.dropForeignKeyIfExists(queryRunner, 'activity', 'FK_activity_postId');
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      CHANGE COLUMN \`fromUserId\` \`from_user_id\` int NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      CHANGE COLUMN \`toUserId\` \`to_user_id\` int NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      CHANGE COLUMN \`contestId\` \`contest_id\` int NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      CHANGE COLUMN \`postId\` \`post_id\` int NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      CHANGE COLUMN \`isAdmin\` \`is_admin\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      ADD CONSTRAINT \`FK_e67eeb490f1a183c27d92d06dfe\` FOREIGN KEY (\`to_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      ADD CONSTRAINT \`FK_86544031c5cb89dea77b32cede1\` FOREIGN KEY (\`from_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      ADD CONSTRAINT \`FK_e592673989138da18babffdef7e\` FOREIGN KEY (\`contest_id\`) REFERENCES \`contests\`(\`id\`) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE \`activity\` 
      ADD CONSTRAINT \`FK_624114671c34d2515ec04c2c88c\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX \`FK_e592673989138da18babffdef7e\` ON \`activity\` (\`contest_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`FK_624114671c34d2515ec04c2c88c\` ON \`activity\` (\`post_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`FK_e67eeb490f1a183c27d92d06dfe\` ON \`activity\` (\`to_user_id\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`FK_86544031c5cb89dea77b32cede1\` ON \`activity\` (\`from_user_id\`)
    `);

    // CONTESTS
    await queryRunner.query(`
      ALTER TABLE \`contests\` 
      CHANGE COLUMN \`startTime\` \`start_time\` timestamp NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`contests\` 
      CHANGE COLUMN \`endTime\` \`end_time\` timestamp NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`contests\` 
      CHANGE COLUMN \`promptExample\` \`prompt_example\` text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`contests\` 
      CHANGE COLUMN \`isApproved\` \`is_approved\` tinyint NOT NULL DEFAULT '0'
    `);

    // USERS
    await queryRunner.query(`
      ALTER TABLE \`users\` 
      CHANGE COLUMN \`isDeleted\` \`is_deleted\` tinyint NOT NULL DEFAULT '0'
    `);

    // POSTS
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_published_blocked_id');
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_contest_published_created');
    await this.dropIndexIfExists(queryRunner, 'posts', 'idx_posts_published_blocked_created');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_posts_isRejected');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_posts_isBlocked');
    await this.dropIndexIfExists(queryRunner, 'posts', 'IDX_posts_isPublished');
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`generationParams\` \`generation_params\` JSON NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`isDelivered\` \`is_delivered\` tinyint NOT NULL DEFAULT '1'
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`isRejected\` \`is_rejected\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`isBlocked\` \`is_blocked\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`isSaved\` \`is_saved\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      CHANGE COLUMN \`isPublished\` \`is_published\` tinyint NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_9940eadb862fdda6a6a64a13a3\` ON \`posts\` (\`is_published\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_e7a92e0b265b6521c8f77c2cf0\` ON \`posts\` (\`is_blocked\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_3ff3ff6ea134f3c785a32fb2fc\` ON \`posts\` (\`is_rejected\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`idx_posts_published_blocked_created\` ON \`posts\` (\`is_published\`, \`is_blocked\`, \`createdAt\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`idx_posts_contest_published_created\` ON \`posts\` (\`contestId\`, \`is_published\`, \`is_blocked\`, \`createdAt\`)
    `);
    await queryRunner.query(`
      CREATE INDEX \`idx_posts_published_blocked_id\` ON \`posts\` (\`is_published\`, \`is_blocked\`, \`id\` DESC)
    `);

  }
}
