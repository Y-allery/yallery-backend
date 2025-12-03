import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminMetrics1764700600000 implements MigrationInterface {
  name = 'CreateAdminMetrics1764700600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin_metrics\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`periodStart\` datetime NOT NULL,
        \`periodEnd\` datetime NOT NULL,
        \`snapshotTime\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`newUsers\` int NOT NULL DEFAULT 0,
        \`totalUsers\` int NOT NULL DEFAULT 0,
        \`newPosts\` int NOT NULL DEFAULT 0,
        \`newImagePosts\` int NOT NULL DEFAULT 0,
        \`newVideoPosts\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_admin_metrics_period_start\` (\`periodStart\`),
        KEY \`IDX_admin_metrics_period_end\` (\`periodEnd\`)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `admin_metrics`');
  }
}


