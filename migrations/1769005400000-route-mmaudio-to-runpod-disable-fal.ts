import { MigrationInterface, QueryRunner } from 'typeorm';

export class RouteMmaudioToRunpodDisableFal1769005400000
  implements MigrationInterface
{
  name = 'RouteMmaudioToRunpodDisableFal1769005400000';

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
        'mmaudio_v2',
        'MMAudio V2',
        'Generate synchronized audio for a video based on a text prompt, returning a new video with an audio track.',
        'runpod',
        'audio_generate',
        100,
        JSON_OBJECT(
          'matchSourceDuration', true,
          'negativePrompt', '',
          'numSteps', 25,
          'cfgStrength', 4.5
        ),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'mmaudio_v2'
          AND \`capability\` = 'audio_generate'
      )
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET
        \`provider\` = 'runpod',
        \`description\` = 'Generate synchronized audio for a video based on a text prompt, returning a new video with an audio track.',
        \`settings\` = JSON_OBJECT(
          'matchSourceDuration', true,
          'negativePrompt', '',
          'numSteps', 25,
          'cfgStrength', 4.5
        ),
        \`isActive\` = 1
      WHERE \`aiService\` = 'mmaudio_v2'
        AND \`capability\` = 'audio_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` = 'flux_fine_tune'
        AND \`capability\` = 'image_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET
        \`provider\` = 'fal_ai',
        \`settings\` = NULL,
        \`isActive\` = 1
      WHERE \`aiService\` = 'mmaudio_v2'
        AND \`capability\` = 'audio_generate'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 1
      WHERE \`aiService\` = 'flux_fine_tune'
        AND \`capability\` = 'image_generate'
    `);
  }
}
