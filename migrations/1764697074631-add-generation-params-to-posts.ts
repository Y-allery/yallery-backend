import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenerationParamsToPosts1764697074631 implements MigrationInterface {
  name = 'AddGenerationParamsToPosts1764697074631';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Спочатку видаляємо старі поля, якщо вони існують (на випадок, якщо була запущена стара версія міграції)
    const columnsToDrop = [
      'prompt',
      'ai_service',
      'orientation',
      'style_id',
      'color_id',
      'width',
      'height',
      'negative_prompt',
    ];

    for (const column of columnsToDrop) {
      const columnExists = await queryRunner.query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'posts' 
        AND COLUMN_NAME = '${column}'
      `);

      if (columnExists[0].count > 0) {
        await queryRunner.query(`
          ALTER TABLE \`posts\` 
          DROP COLUMN \`${column}\`
        `);
      }
    }
    
    // Перевіряємо, чи вже існує generation_params
    const generationParamsExists = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'posts' 
      AND COLUMN_NAME = 'generation_params'
    `);

    // Додаємо JSON поле для збереження параметрів генерації, якщо його ще немає
    if (generationParamsExists[0].count === 0) {
      await queryRunner.query(`
        ALTER TABLE \`posts\` 
        ADD COLUMN \`generation_params\` JSON NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видаляємо JSON поле, якщо воно існує
    const generationParamsExists = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'posts' 
      AND COLUMN_NAME = 'generation_params'
    `);

    if (generationParamsExists[0].count > 0) {
      await queryRunner.query(`
        ALTER TABLE \`posts\` 
        DROP COLUMN \`generation_params\`
      `);
    }
  }
}

