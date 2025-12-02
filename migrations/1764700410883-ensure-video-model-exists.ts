import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureVideoModelExists1764700410883 implements MigrationInterface {
  name = 'EnsureVideoModelExists1764700410883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Перевіряємо, чи вже існує запис для byty_dance
    const existingRecord = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM \`ai_settings\` 
      WHERE \`ai_service\` = 'byty_dance'
    `);

    // Додаємо відео модель, якщо її немає
    if (existingRecord[0].count === 0) {
      // ⬇️ ТУТ ДОДАЄТЬСЯ ВІДЕО МОДЕЛЬ В ТАБЛИЦЮ ⬇️
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
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видаляємо відео модель
    await queryRunner.query(`
      DELETE FROM \`ai_settings\` 
      WHERE \`ai_service\` = 'byty_dance' AND \`type\` = 'video'
    `);
  }
}
