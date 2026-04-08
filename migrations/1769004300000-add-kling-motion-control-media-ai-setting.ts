import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKlingMotionControlMediaAiSetting1769004300000
  implements MigrationInterface
{
  name = 'AddKlingMotionControlMediaAiSetting1769004300000';

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
        'kling_v26_std_motion_control',
        'Kling v2.6 Standard Motion Control',
        'Meme motion-transfer generation powered by the public RunPod Kling v2.6 Standard Motion Control endpoint.',
        'runpod',
        'meme_generate',
        100,
        JSON_OBJECT(
          'characterOrientations',
          JSON_ARRAY('image', 'video'),
          'defaultCharacterOrientation',
          'video',
          'keepOriginalSound',
          true
        ),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'kling_v26_std_motion_control'
          AND \`capability\` = 'meme_generate'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'kling_v26_std_motion_control'
        AND \`capability\` = 'meme_generate'
    `);
  }
}
