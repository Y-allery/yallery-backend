import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAIFinetunesAndSdxlLoraSettings1769005100000
  implements MigrationInterface
{
  name = 'CreateAIFinetunesAndSdxlLoraSettings1769005100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`ai_finetunes\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`name\` varchar(160) NOT NULL,
        \`triggerWord\` varchar(120) NOT NULL,
        \`loraKey\` varchar(120) NOT NULL,
        \`className\` varchar(80) NOT NULL DEFAULT 'character',
        \`status\` varchar(40) NOT NULL DEFAULT 'pending',
        \`datasetImages\` json NOT NULL,
        \`datasetImageCount\` int NOT NULL DEFAULT 0,
        \`trainingSettings\` json NULL,
        \`generationDefaults\` json NULL,
        \`runpodEndpointId\` varchar(120) NULL,
        \`runpodJobId\` varchar(160) NULL,
        \`loraUrl\` text NULL,
        \`errorMessage\` text NULL,
        \`rawOutput\` json NULL,
        UNIQUE INDEX \`IDX_ai_finetunes_loraKey\` (\`loraKey\`),
        INDEX \`IDX_ai_finetunes_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT INTO \`media_ai_settings\` (
        \`aiService\`,
        \`name\`,
        \`description\`,
        \`provider\`,
        \`capability\`,
        \`cost\`,
        \`settings\`,
        \`isActive\`
      )
      SELECT
        'sdxl_lora_finetune',
        'SDXL LoRA Fine-tune Trainer',
        'Trains reusable SDXL LoRA profiles from Cloudinary datasets on RunPod.',
        'runpod',
        'finetune_train',
        0,
        JSON_OBJECT('contestOnly', true),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'sdxl_lora_finetune'
          AND \`capability\` = 'finetune_train'
      )
    `);

    await queryRunner.query(`
      INSERT INTO \`media_ai_settings\` (
        \`aiService\`,
        \`name\`,
        \`description\`,
        \`provider\`,
        \`capability\`,
        \`cost\`,
        \`settings\`,
        \`isActive\`
      )
      SELECT
        'sdxl_lora_generation',
        'SDXL LoRA Contest Generation',
        'Generates contest images with a selected SDXL LoRA profile on RunPod.',
        'runpod',
        'image_generate',
        12,
        JSON_OBJECT('contestOnly', true),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'sdxl_lora_generation'
          AND \`capability\` = 'image_generate'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE (\`aiService\` = 'sdxl_lora_finetune' AND \`capability\` = 'finetune_train')
         OR (\`aiService\` = 'sdxl_lora_generation' AND \`capability\` = 'image_generate')
    `);

    await queryRunner.query('DROP TABLE IF EXISTS `ai_finetunes`');
  }
}
