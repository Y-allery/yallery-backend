import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiServices1726830988322 implements MigrationInterface {
    name = 'AddAiServices1726830988322'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('sdxl', 'sd3', 'sd') NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_service_tokens\` CHANGE \`ai_service\` \`ai_service\` enum ('dalle2', 'dalle3', 'octoai') NOT NULL`);
    }

}
