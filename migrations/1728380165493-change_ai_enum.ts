import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeAiEnum1728380165493 implements MigrationInterface {
    name = 'ChangeAiEnum1728380165493'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('aura_flow', 'flux', 'turbo_diffusion') NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('sdxl', 'sd3', 'sd') NOT NULL`);
    }

}
