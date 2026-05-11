import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoDurationPricingToMediaAISettings1769004400000
  implements MigrationInterface
{
  name = 'AddVideoDurationPricingToMediaAISettings1769004400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_SET(
        COALESCE(\`settings\`, JSON_OBJECT()),
        '$.durations',
        JSON_ARRAY(5, 10),
        '$.pricing',
        JSON_OBJECT(
          'strategy',
          'per_second',
          'creditsPerSecond',
          10
        )
      )
      WHERE \`aiService\` IN ('p_video_text', 'p_video_image')
        AND \`capability\` = 'video_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_REMOVE(COALESCE(\`settings\`, JSON_OBJECT()), '$.pricing')
      WHERE \`aiService\` IN ('p_video_text', 'p_video_image')
        AND \`capability\` = 'video_generate'
    `);
  }
}
