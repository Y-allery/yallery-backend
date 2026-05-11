import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSdxlPrivateRunpodMediaSetting1769004600000
  implements MigrationInterface
{
  name = 'AddSdxlPrivateRunpodMediaSetting1769004600000';

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
        'sdxl',
        'SDXL',
        'Prompt-to-image generation powered by the private RunPod SDXL endpoint.',
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
      UPDATE \`media_ai_settings\`
      SET
        \`provider\` = 'runpod',
        \`description\` = 'Prompt-to-image generation powered by the private RunPod SDXL endpoint.',
        \`isActive\` = 1
      WHERE \`aiService\` = 'sdxl'
        AND \`capability\` = 'image_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` = 'sdxl'
        AND \`capability\` = 'image_generate'
    `);
  }
}
