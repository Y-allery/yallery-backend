import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertAiServiceTokensToPools1769003500000
  implements MigrationInterface
{
  name = 'ConvertAiServiceTokensToPools1769003500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_service_tokens\`
      CHANGE \`ai_service\` \`pool_key\` VARCHAR(100) NOT NULL
    `);

    await queryRunner.query(`
      UPDATE \`ai_service_tokens\`
      SET \`pool_key\` = 'fal_shared'
    `);

    await queryRunner.query(`
      DELETE t1
      FROM \`ai_service_tokens\` t1
      INNER JOIN \`ai_service_tokens\` t2
        ON t1.\`pool_key\` = t2.\`pool_key\`
       AND t1.\`token\` = t2.\`token\`
       AND (
         t1.\`updated_at\` < t2.\`updated_at\`
         OR (t1.\`updated_at\` = t2.\`updated_at\` AND t1.\`id\` < t2.\`id\`)
       )
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_ai_service_tokens_pool_status_updated\`
      ON \`ai_service_tokens\` (\`pool_key\`, \`status\`, \`updated_at\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_ai_service_tokens_pool_status_updated\`
      ON \`ai_service_tokens\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`ai_service_tokens\`
      CHANGE \`pool_key\` \`ai_service\` TEXT NOT NULL
    `);
  }
}
