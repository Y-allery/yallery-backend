import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOldKlingMemeMediaAISetting1769004900000
  implements MigrationInterface
{
  name = 'RemoveOldKlingMemeMediaAISetting1769004900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'kling_v26_std_motion_control'
        AND \`capability\` = 'meme_generate'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      ) VALUES (
        'kling_v26_std_motion_control',
        'Kling v2.6 Standard Motion Control',
        'Meme motion-transfer generation powered by the public RunPod Kling v2.6 Standard Motion Control endpoint.',
        'runpod',
        'meme_generate',
        40,
        JSON_OBJECT(
          'keepOriginalSound', true,
          'matchSourceDuration', true,
          'outputFrameRate', 30
        ),
        0
      )
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`description\` = VALUES(\`description\`),
        \`provider\` = VALUES(\`provider\`),
        \`cost\` = VALUES(\`cost\`),
        \`settings\` = VALUES(\`settings\`),
        \`isActive\` = VALUES(\`isActive\`)
    `);
  }
}
