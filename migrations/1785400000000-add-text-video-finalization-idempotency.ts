import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTextVideoFinalizationIdempotency1785400000000
  implements MigrationInterface
{
  name = 'AddTextVideoFinalizationIdempotency1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`posts\`
        ADD COLUMN \`generationTaskId\` varchar(64) NULL,
        ADD UNIQUE INDEX \`IDX_posts_generation_task_id\` (\`generationTaskId\`)
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
        ADD COLUMN \`idempotencyKey\` varchar(128) NULL,
        ADD UNIQUE INDEX \`IDX_user_activities_idempotency_key\` (\`idempotencyKey\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_activities\`
        DROP INDEX \`IDX_user_activities_idempotency_key\`,
        DROP COLUMN \`idempotencyKey\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`posts\`
        DROP INDEX \`IDX_posts_generation_task_id\`,
        DROP COLUMN \`generationTaskId\`
    `);
  }
}
