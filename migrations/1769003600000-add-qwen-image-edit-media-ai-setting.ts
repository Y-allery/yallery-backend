import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQwenImageEditMediaAISetting1769003600000
  implements MigrationInterface
{
  name = 'AddQwenImageEditMediaAISetting1769003600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO \`media_ai_settings\` (
        \`aiService\`,
        \`name\`,
        \`description\`,
        \`provider\`,
        \`capability\`,
        \`cost\`,
        \`isActive\`
      )
      SELECT
        'qwen_image_edit',
        'Qwen Image Edit',
        'Image editing powered by a public RunPod Qwen Image Edit endpoint.',
        'runpod',
        'image_edit',
        25,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'qwen_image_edit'
          AND \`capability\` = 'image_edit'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'qwen_image_edit'
        AND \`capability\` = 'image_edit'
    `);
  }
}
