import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelaisticVision1729859081301 implements MigrationInterface {
  name = 'AddRelaisticVision1729859081301';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('aura_flow', 'flux', 'realistic_vision') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('aura_flow', 'flux', 'turbo_diffusion') NOT NULL`,
    );
  }
}
