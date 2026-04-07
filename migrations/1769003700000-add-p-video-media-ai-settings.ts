import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPVideoMediaAISettings1769003700000
  implements MigrationInterface
{
  name = 'AddPVideoMediaAISettings1769003700000';

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
        'p_video_text',
        'P-Video',
        'Text-to-video generation powered by the public RunPod P-Video endpoint.',
        'runpod',
        'video_generate',
        50,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'p_video_text'
          AND \`capability\` = 'video_generate'
      )
    `);

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
        'p_video_image',
        'P-Video',
        'Image-to-video generation powered by the public RunPod P-Video endpoint.',
        'runpod',
        'video_generate',
        50,
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'p_video_image'
          AND \`capability\` = 'video_generate'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` IN ('p_video_text', 'p_video_image')
        AND \`capability\` = 'video_generate'
    `);
  }
}
