import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwitchMemeRunpodToWan22Animate1769004700000
  implements MigrationInterface
{
  name = 'SwitchMemeRunpodToWan22Animate1769004700000';

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
        'wan22_animate_native',
        'WAN 2.2 Animate Native',
        'Meme motion-transfer generation powered by the private RunPod WAN 2.2 Animate native endpoint.',
        'runpod',
        'meme_generate',
        100,
        JSON_OBJECT(
          'characterOrientations',
          JSON_ARRAY('image', 'video'),
          'defaultCharacterOrientation',
          'video',
          'keepOriginalSound',
          true,
          'matchSourceDuration',
          true,
          'outputFrameRate',
          30
        ),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'wan22_animate_native'
          AND \`capability\` = 'meme_generate'
      )
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` = 'kling_v26_std_motion_control'
        AND \`capability\` = 'meme_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 1
      WHERE \`aiService\` = 'kling_v26_std_motion_control'
        AND \`capability\` = 'meme_generate'
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'wan22_animate_native'
        AND \`capability\` = 'meme_generate'
    `);
  }
}
