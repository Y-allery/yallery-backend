import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOldImageMediaAISettings1769004800000
  implements MigrationInterface
{
  name = 'RemoveOldImageMediaAISettings1769004800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`contests\`
      SET \`mediaAiSettingId\` = (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux2_klein'
          AND \`capability\` = 'image_generate'
        LIMIT 1
      )
      WHERE \`mediaAiSettingId\` IN (
        SELECT \`id\`
        FROM \`media_ai_settings\`
        WHERE \`aiService\` IN ('nano_banana', 'flux_schnell')
          AND \`capability\` = 'image_generate'
      )
        AND EXISTS (
          SELECT 1
          FROM \`media_ai_settings\`
          WHERE \`aiService\` = 'flux2_klein'
            AND \`capability\` = 'image_generate'
        )
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE (
        \`capability\` = 'image_generate'
        AND \`aiService\` IN ('nano_banana', 'flux_schnell')
      )
        OR (
          \`capability\` = 'image_edit'
          AND \`aiService\` = 'qwen_image_edit'
        )
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
      ) VALUES
      (
        'nano_banana',
        'Nano Banana',
        'Prompt-to-image generation powered by the public RunPod Google Nano Banana endpoint.',
        'runpod',
        'image_generate',
        30,
        NULL,
        0
      ),
      (
        'flux_schnell',
        'FLUX.1 Schnell',
        'Prompt-to-image generation powered by the public RunPod FLUX.1 Schnell endpoint.',
        'runpod',
        'image_generate',
        11,
        NULL,
        0
      ),
      (
        'qwen_image_edit',
        'Qwen Image Edit',
        'Image editing powered by a public RunPod Qwen Image Edit endpoint.',
        'runpod',
        'image_edit',
        25,
        NULL,
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
