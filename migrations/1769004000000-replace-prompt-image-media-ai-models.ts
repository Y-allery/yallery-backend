import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplacePromptImageMediaAiModels1769004000000
  implements MigrationInterface
{
  name = 'ReplacePromptImageMediaAiModels1769004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        'nano_banana',
        'Nano Banana',
        'Prompt-to-image generation powered by the public RunPod Google Nano Banana endpoint.',
        'runpod',
        'image_generate',
        30,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'nano_banana'
          AND \`capability\` = 'image_generate'
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
        'flux_schnell',
        'FLUX.1 Schnell',
        'Prompt-to-image generation powered by the public RunPod FLUX.1 Schnell endpoint.',
        'runpod',
        'image_generate',
        11,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux_schnell'
          AND \`capability\` = 'image_generate'
      )
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`capability\` = 'image_generate'
        AND \`aiService\` IN ('flux', 'sdxl')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
        'flux',
        'FLUX AI',
        'Prompt-to-image generation powered by RunPod FLUX endpoint.',
        'runpod',
        'image_generate',
        30,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux'
          AND \`capability\` = 'image_generate'
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
        'sdxl',
        'SDXL',
        'Prompt-to-image generation powered by RunPod SDXL endpoint.',
        'runpod',
        'image_generate',
        11,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'sdxl'
          AND \`capability\` = 'image_generate'
      )
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`capability\` = 'image_generate'
        AND \`aiService\` IN ('nano_banana', 'flux_schnell')
    `);
  }
}
