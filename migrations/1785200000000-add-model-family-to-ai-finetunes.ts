import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModelFamilyToAIFinetunes1785200000000
  implements MigrationInterface
{
  name = 'AddModelFamilyToAIFinetunes1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_finetunes\`
        ADD COLUMN \`modelFamily\` varchar(32) NOT NULL DEFAULT 'sdxl' AFTER \`className\`,
        ADD COLUMN \`baseModel\` varchar(255) NOT NULL DEFAULT 'stabilityai/stable-diffusion-xl-base-1.0' AFTER \`modelFamily\`,
        ADD INDEX \`IDX_ai_finetunes_modelFamily\` (\`modelFamily\`)
    `);

    // The column defaults backfill existing rows in MySQL. Keep this explicit
    // normalization for databases restored from older hand-edited schemas.
    await queryRunner.query(`
      UPDATE \`ai_finetunes\`
      SET
        \`modelFamily\` = 'sdxl',
        \`baseModel\` = 'stabilityai/stable-diffusion-xl-base-1.0'
      WHERE \`modelFamily\` IS NULL
         OR \`modelFamily\` = ''
         OR \`baseModel\` IS NULL
         OR \`baseModel\` = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ count: string | number }> = await queryRunner.query(`
      SELECT COUNT(*) AS \`count\`
      FROM \`ai_finetunes\`
      WHERE \`modelFamily\` <> 'sdxl'
    `);
    if (Number(rows[0]?.count || 0) > 0) {
      throw new Error(
        'Refusing to drop AI fine-tune model metadata while non-SDXL rows exist',
      );
    }

    await queryRunner.query(`
      ALTER TABLE \`ai_finetunes\`
        DROP INDEX \`IDX_ai_finetunes_modelFamily\`,
        DROP COLUMN \`baseModel\`,
        DROP COLUMN \`modelFamily\`
    `);
  }
}
