import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Opts the Qwen image-edit model into multi-reference input (1-3 images in, still 1 image out).
 *
 * Deliberately does NOT touch `$.maxImages` (set to 1 by 1769005500000): shipped app builds bind
 * that key to the OUTPUT quantity stepper and to `cost * quantity`, so raising it would show a
 * 1/3 stepper and pre-charge 3x on every existing client. The new keys are ignored by older
 * clients, so this is safe to run ahead of any app release.
 */
export class AddReferenceImageLimitsToImageEdit1785800000000
  implements MigrationInterface
{
  name = 'AddReferenceImageLimitsToImageEdit1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.minReferenceImages', 1,
        '$.maxReferenceImages', 3
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
        '$.minReferenceImages',
        '$.maxReferenceImages'
      )
      WHERE \`aiService\` = 'qwen_image_edit_baked'
        AND \`capability\` = 'image_edit'
    `);
  }
}
