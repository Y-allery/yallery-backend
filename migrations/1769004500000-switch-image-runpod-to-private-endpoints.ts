import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwitchImageRunpodToPrivateEndpoints1769004500000
  implements MigrationInterface
{
  name = 'SwitchImageRunpodToPrivateEndpoints1769004500000';

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
        'flux2_klein',
        'FLUX.2 Klein',
        'Prompt-to-image generation powered by the private RunPod FLUX.2 Klein endpoint.',
        'runpod',
        'image_generate',
        11,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux2_klein'
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
        'qwen_image_edit_baked',
        'Qwen Image Edit Baked',
        'Image editing powered by the private RunPod Qwen Image Edit baked endpoint.',
        'runpod',
        'image_edit',
        25,
        NULL,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'qwen_image_edit_baked'
          AND \`capability\` = 'image_edit'
      )
    `);

    await queryRunner.query(`
      UPDATE \`contests\`
      SET \`mediaAiSettingId\` = (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux2_klein'
          AND \`capability\` = 'image_generate'
        LIMIT 1
      )
      WHERE \`mediaAiSettingId\` IN (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` IN ('nano_banana', 'flux_schnell')
          AND \`capability\` = 'image_generate'
      )
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` IN ('nano_banana', 'flux_schnell')
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` = 'qwen_image_edit'
        AND \`capability\` = 'image_edit'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 1
      WHERE \`aiService\` IN ('nano_banana', 'flux_schnell')
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 1
      WHERE \`aiService\` = 'qwen_image_edit'
        AND \`capability\` = 'image_edit'
    `);

    await queryRunner.query(`
      UPDATE \`contests\`
      SET \`mediaAiSettingId\` = (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'nano_banana'
          AND \`capability\` = 'image_generate'
        LIMIT 1
      )
      WHERE \`mediaAiSettingId\` IN (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux2_klein'
          AND \`capability\` = 'image_generate'
      )
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'flux2_klein'
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'qwen_image_edit_baked'
        AND \`capability\` = 'image_edit'
    `);
  }
}
