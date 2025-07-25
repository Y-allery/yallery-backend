import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeAiServiceString1750847219784 implements MigrationInterface {
  name = 'MakeAiServiceString1750847219784';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE \`ai_service_tokens\` 
            MODIFY \`ai_service\` TEXT NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE \`ai_service_tokens\` 
            MODIFY \`ai_service\` ENUM('aura_flow', 'flux', 'realistic_vision', 'flux_pro_fine_tune') NOT NULL
        `);
  }
}
