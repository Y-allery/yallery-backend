import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class AddCascadeDeletsToUser1725567237674 implements MigrationInterface {
  name = 'AddCascadeDeletsToUser1725567237674';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const activityTable = await queryRunner.getTable('activity');

    const foreignKeyExists = activityTable.foreignKeys.some(
      (fk) => fk.name === 'FK_e67eeb490f1a183c27d92d06dfe',
    );

    if (!foreignKeyExists) {
      await queryRunner.createForeignKey(
        'activity',
        new TableForeignKey({
          name: 'FK_e67eeb490f1a183c27d92d06dfe',
          columnNames: ['to_user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }

    const postForeignKeyExists = activityTable.foreignKeys.some(
      (fk) => fk.name === 'FK_624114671c34d2515ec04c2c88c',
    );

    if (!postForeignKeyExists) {
      await queryRunner.createForeignKey(
        'activity',
        new TableForeignKey({
          name: 'FK_624114671c34d2515ec04c2c88c',
          columnNames: ['post_id'],
          referencedTableName: 'posts',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }

    const userDeviceTokensTable =
      await queryRunner.getTable('user_device_tokens');
    const userDeviceTokensForeignKeyExists =
      userDeviceTokensTable.foreignKeys.some(
        (fk) => fk.name === 'FK_a11372c2ee3197be5691d0d8ed0',
      );

    if (!userDeviceTokensForeignKeyExists) {
      await queryRunner.createForeignKey(
        'user_device_tokens',
        new TableForeignKey({
          name: 'FK_a11372c2ee3197be5691d0d8ed0',
          columnNames: ['userId'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }

    const notificationPreferencesTable = await queryRunner.getTable(
      'notification_preferences',
    );
    const notificationForeignKeyExists =
      notificationPreferencesTable.foreignKeys.some(
        (fk) => fk.name === 'FK_b70c44e8b00757584a393225593',
      );

    if (!notificationForeignKeyExists) {
      await queryRunner.createForeignKey(
        'notification_preferences',
        new TableForeignKey({
          name: 'FK_b70c44e8b00757584a393225593',
          columnNames: ['userId'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }

    const postsTable = await queryRunner.getTable('posts');
    const postsForeignKeyExists = postsTable.foreignKeys.some(
      (fk) => fk.name === 'FK_ae05faaa55c866130abef6e1fee',
    );

    if (!postsForeignKeyExists) {
      await queryRunner.createForeignKey(
        'posts',
        new TableForeignKey({
          name: 'FK_ae05faaa55c866130abef6e1fee',
          columnNames: ['userId'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }

    const usersTagsTable = await queryRunner.getTable('users_tags_tags');
    const usersTagsForeignKeyExists = usersTagsTable.foreignKeys.some(
      (fk) => fk.name === 'FK_9de46fe02d9d7488f92bedf4176',
    );

    if (!usersTagsForeignKeyExists) {
      await queryRunner.createForeignKey(
        'users_tags_tags',
        new TableForeignKey({
          name: 'FK_9de46fe02d9d7488f92bedf4176',
          columnNames: ['tagsId'],
          referencedTableName: 'tags',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Тут видаляються ті ж самі ключі без додаткових перевірок
    await queryRunner.query(
      `ALTER TABLE \`notification_preferences\` DROP FOREIGN KEY \`FK_b70c44e8b00757584a393225593\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_device_tokens\` DROP FOREIGN KEY \`FK_a11372c2ee3197be5691d0d8ed0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_624114671c34d2515ec04c2c88c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`activity\` DROP FOREIGN KEY \`FK_e67eeb490f1a183c27d92d06dfe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users_tags_tags\` DROP FOREIGN KEY \`FK_9de46fe02d9d7488f92bedf4176\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`posts\` DROP FOREIGN KEY \`FK_ae05faaa55c866130abef6e1fee\``,
    );
  }
}
