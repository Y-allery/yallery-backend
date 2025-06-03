import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewAiEnumValue1739914609299 implements MigrationInterface {
  name = 'AddNewAiEnumValue1739914609299';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('aura_flow', 'flux', 'realistic_vision', 'flux_pro_fine_tune') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('aura_flow', 'flux', 'realistic_vision') NOT NULL`,
    );
  }
}
