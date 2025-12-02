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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видаляємо поле type
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\` 
      DROP COLUMN \`type\`
    `);
  }
}
