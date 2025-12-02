import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenerationParamsToPosts1764697074631 implements MigrationInterface {
  name = 'AddGenerationParamsToPosts1764697074631';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`posts\` 
      ADD COLUMN \`generation_params\` JSON NULL
    `);
    
    await queryRunner.query(`
      UPDATE \`posts\` 
      SET \`generation_params\` = JSON_OBJECT(
        'prompt', 'Unknown',
        'ai_service', 'flux',
        'orientation', 'vertical'
      )
      WHERE \`generation_params\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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

