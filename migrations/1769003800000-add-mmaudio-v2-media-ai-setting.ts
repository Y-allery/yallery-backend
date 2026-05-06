import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMmaudioV2MediaAiSetting1769003800000
  implements MigrationInterface
{
  name = 'AddMmaudioV2MediaAiSetting1769003800000';

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
        'mmaudio_v2',
        'MMAudio V2',
        'Generate synchronized audio for a video based on a text prompt, returning a new video with an audio track.',
        'fal_ai',
        'audio_generate',
        100,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'mmaudio_v2'
          AND \`capability\` = 'audio_generate'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'mmaudio_v2'
        AND \`capability\` = 'audio_generate'
    `);
  }
}
