import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenerationParamsToPosts1764697074631 implements MigrationInterface {
  name = 'AddGenerationParamsToPosts1764697074631';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Додаємо JSON поле для збереження параметрів генерації
    await queryRunner.query(`
      ALTER TABLE "posts" 
      ADD COLUMN "generation_params" JSON NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Видаляємо JSON поле
    await queryRunner.query(`
      ALTER TABLE "posts" 
      DROP COLUMN "generation_params"
    `);
  }
}

