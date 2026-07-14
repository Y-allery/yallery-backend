import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentTranslations1783000000000 implements MigrationInterface {
  name = 'AddContentTranslations1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`content_translations\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`entityType\` varchar(24) NOT NULL,
        \`entityId\` int NOT NULL,
        \`locale\` varchar(8) NOT NULL,
        \`fields\` json NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX \`IDX_content_translations_entity_locale\` (\`entityType\`, \`entityId\`, \`locale\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(
      'ALTER TABLE `users` ADD `language` varchar(8) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `language`');
    await queryRunner.query('DROP TABLE `content_translations`');
  }
}
