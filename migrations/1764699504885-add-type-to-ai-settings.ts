import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeToAiSettings1764699504885 implements MigrationInterface {
  name = 'AddTypeToAiSettings1764699504885';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Додаємо поле type для розрізнення image та video
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      ADD COLUMN \`type\` ENUM('image', 'video') NOT NULL DEFAULT 'image'
    `);

    // Оновлюємо існуючі записи - всі поточні записи це зображення
    await queryRunner.query(`
      UPDATE \`ai_settings\` 
      SET \`type\` = 'image' 
      WHERE \`type\` = 'image' OR \`type\` IS NULL
    `);

    // Оновлюємо відео модель (byty_dance) на тип 'video', якщо вона вже існує
    await queryRunner.query(`
      UPDATE \`ai_settings\` 
      SET \`type\` = 'video' 
      WHERE \`ai_service\` = 'byty_dance'
    `);

    // Додаємо відео модель, якщо її ще немає
    const existingVideoRecord = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM \`ai_settings\` 
      WHERE \`ai_service\` = 'byty_dance'
    `);

    if (existingVideoRecord[0].count === 0) {
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
    // Видаляємо поле type
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      DROP COLUMN \`type\`
    `);
  }
}
