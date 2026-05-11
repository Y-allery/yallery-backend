import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserActivities1769004200000 implements MigrationInterface {
  name = 'CreateUserActivities1769004200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`user_activities\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`type\` varchar(64) NOT NULL,
        \`category\` varchar(32) NOT NULL,
        \`pointsDelta\` int NOT NULL DEFAULT 0,
        \`descriptionSnapshot\` text NOT NULL,
        \`payload\` json NULL,
        \`previewUrl\` varchar(2048) NULL,
        \`isRead\` tinyint NOT NULL DEFAULT 0,
        \`readAt\` timestamp NULL,
        \`userId\` int NOT NULL,
        \`actorUserId\` int NULL,
        \`postId\` int NULL,
        \`contestId\` int NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_user_activities_user_created_at\`
      ON \`user_activities\` (\`userId\`, \`createdAt\`)
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_user_activities_user_is_read_created_at\`
      ON \`user_activities\` (\`userId\`, \`isRead\`, \`createdAt\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      ADD CONSTRAINT \`FK_user_activities_userId\`
      FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      ADD CONSTRAINT \`FK_user_activities_actorUserId\`
      FOREIGN KEY (\`actorUserId\`) REFERENCES \`users\`(\`id\`)
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      ADD CONSTRAINT \`FK_user_activities_postId\`
      FOREIGN KEY (\`postId\`) REFERENCES \`posts\`(\`id\`)
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      ADD CONSTRAINT \`FK_user_activities_contestId\`
      FOREIGN KEY (\`contestId\`) REFERENCES \`contests\`(\`id\`)
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      DROP FOREIGN KEY \`FK_user_activities_contestId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      DROP FOREIGN KEY \`FK_user_activities_postId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      DROP FOREIGN KEY \`FK_user_activities_actorUserId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
      DROP FOREIGN KEY \`FK_user_activities_userId\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_user_activities_user_is_read_created_at\`
      ON \`user_activities\`
    `);
    await queryRunner.query(`
      DROP INDEX \`IDX_user_activities_user_created_at\`
      ON \`user_activities\`
    `);
    await queryRunner.query(`
      DROP TABLE \`user_activities\`
    `);
  }
}
