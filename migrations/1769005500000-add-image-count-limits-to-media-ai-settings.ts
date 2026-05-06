import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageCountLimitsToMediaAISettings1769005500000
  implements MigrationInterface
{
  name = 'AddImageCountLimitsToMediaAISettings1769005500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.minImages', 1,
        '$.maxImages', 1
      )
      WHERE \`aiService\` = 'flux2_klein'
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.minImages', 1,
        '$.maxImages', 5
      )
      WHERE \`aiService\` = 'sdxl'
        AND \`capability\` = 'image_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.minImages', 1,
        '$.maxImages', 1
      )
      WHERE \`aiService\` = 'qwen_image_edit_baked'
        AND \`capability\` = 'image_edit'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_REMOVE(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.minImages',
        '$.maxImages'
      )
      WHERE \`aiService\` IN (
          'flux2_klein',
          'sdxl',
          'qwen_image_edit_baked'
        )
        AND \`capability\` IN ('image_generate', 'image_edit')
    `);
  }
}
