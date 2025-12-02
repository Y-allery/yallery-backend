import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoAiSettings1764699383908 implements MigrationInterface {
  name = 'AddVideoAiSettings1764699383908';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existingRecord = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM \`ai_settings\` 
      WHERE \`ai_service\` = 'byty_dance'
    `);

    if (existingRecord[0].count === 0) {
      const typeColumnExists = await queryRunner.query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'ai_settings' 
        AND COLUMN_NAME = 'type'
      `);

      if (typeColumnExists[0].count > 0) {
        await queryRunner.query(`
          INSERT INTO \`ai_settings\` (
            \`ai_service\`, \`name\`, \`allowedOrientations\`, \`minImages\`, \`maxImages\`,
            \`maxPromptLength\`, \`sizes\`, \`qualityOptions\`, \`styles\`, \`cost\`,
            \`api_model\`, \`description\`, \`type\`, \`is_artem\`, \`is_active\`
          ) VALUES (
            'byty_dance',
            'Byty Dance',
            '[]',
            1,
            1,
            1000,
            NULL,
            NULL,
            NULL,
            100,
            'fal-ai/bytedance/seedance/v1/lite/image-to-video',
            'Create animated videos from your image with BytyDance.',
            'video',
            0,
            1
          )
        `);
      } else {
        await queryRunner.query(`
          INSERT INTO \`ai_settings\` (
            \`ai_service\`, \`name\`, \`allowedOrientations\`, \`minImages\`, \`maxImages\`,
            \`maxPromptLength\`, \`sizes\`, \`qualityOptions\`, \`styles\`, \`cost\`,
            \`api_model\`, \`description\`, \`is_artem\`, \`is_active\`
          ) VALUES (
            'byty_dance',
            'Byty Dance',
            '[]',
            1,
            1,
            1000,
            NULL,
            NULL,
            NULL,
            100,
            'fal-ai/bytedance/seedance/v1/lite/image-to-video',
            'Create animated videos from your image with BytyDance.',
            0,
            1
          )
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`ai_settings\` 
      WHERE \`ai_service\` = 'byty_dance' AND \`type\` = 'video'
    `);
  }
}
