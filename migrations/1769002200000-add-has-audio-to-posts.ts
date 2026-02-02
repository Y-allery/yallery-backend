import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasAudioToPosts1769002200000 implements MigrationInterface {
  name = 'AddHasAudioToPosts1769002200000';

  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
    `);
    return Number(result?.[0]?.count ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existsHasAudio = await this.columnExists(queryRunner, 'posts', 'hasAudio');
    const existsHasAudioSnake = await this.columnExists(queryRunner, 'posts', 'has_audio');

    if (existsHasAudio || existsHasAudioSnake) return;

    await queryRunner.query(`
      ALTER TABLE \`posts\`
      ADD COLUMN \`hasAudio\` TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existsHasAudio = await this.columnExists(queryRunner, 'posts', 'hasAudio');
    if (!existsHasAudio) return;

    await queryRunner.query(`
      ALTER TABLE \`posts\`
      DROP COLUMN \`hasAudio\`
    `);
  }
}

