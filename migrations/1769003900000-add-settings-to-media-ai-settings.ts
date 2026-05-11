import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSettingsToMediaAISettings1769003900000
  implements MigrationInterface
{
  name = 'AddSettingsToMediaAISettings1769003900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`media_ai_settings\`
      ADD COLUMN \`settings\` json NULL
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`settings\` = JSON_OBJECT('durations', JSON_ARRAY(5, 10))
      WHERE \`aiService\` IN ('p_video_text', 'p_video_image')
        AND \`capability\` = 'video_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`media_ai_settings\`
      DROP COLUMN \`settings\`
    `);
  }
}
