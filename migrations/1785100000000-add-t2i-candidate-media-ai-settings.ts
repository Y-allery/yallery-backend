import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2026-07-24 t2i battery candidates C (qwen_image_2512) and D (z_image_turbo). Both rows are
 * inserted with isActive=0 (dark by default) -- see workers/out/t2i-battery-2026-07-24/RUNBOOK.md
 * for the morning flip (PUT /admin/ai-settings/:id {isActive:true}). cost/settings are copied
 * from the live qwen_image row so pricing stays consistent with the current default model until
 * an admin deliberately changes it post-battery.
 */
export class AddT2iCandidateMediaAISettings1785100000000
  implements MigrationInterface
{
  name = 'AddT2iCandidateMediaAISettings1785100000000';

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
        'qwen_image_2512',
        'Qwen Image 2512',
        'Prompt-to-image generation powered by the private RunPod Qwen-Image-2512 endpoint (undistilled, 2026-07-24 t2i battery candidate C -- quality ceiling, not a fast default).',
        'runpod',
        'image_generate',
        src.\`cost\`,
        src.\`settings\`,
        0
      FROM \`media_ai_settings\` src
      WHERE src.\`aiService\` = 'qwen_image'
        AND src.\`capability\` = 'image_generate'
        AND NOT EXISTS (
          SELECT 1
          FROM \`media_ai_settings\`
          WHERE \`aiService\` = 'qwen_image_2512'
            AND \`capability\` = 'image_generate'
        )
      LIMIT 1
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
        'z_image_turbo',
        'Z-Image Turbo',
        'Prompt-to-image generation powered by the private RunPod Z-Image-Turbo endpoint (2026-07-24 t2i battery candidate D).',
        'runpod',
        'image_generate',
        src.\`cost\`,
        src.\`settings\`,
        0
      FROM \`media_ai_settings\` src
      WHERE src.\`aiService\` = 'qwen_image'
        AND src.\`capability\` = 'image_generate'
        AND NOT EXISTS (
          SELECT 1
          FROM \`media_ai_settings\`
          WHERE \`aiService\` = 'z_image_turbo'
            AND \`capability\` = 'image_generate'
        )
      LIMIT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'qwen_image_2512'
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'z_image_turbo'
        AND \`capability\` = 'image_generate'
    `);
  }
}
