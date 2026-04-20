import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAuraFlowToIdeogramV21769020000000
  implements MigrationInterface
{
  name = 'RenameAuraFlowToIdeogramV21769020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET
        \`name\` = 'Ideogram V2',
        \`description\` = 'High-quality image generation with strong typography and layout handling, well-suited for posters, branding, and design-heavy visuals.'
      WHERE \`${serviceCol}\` = 'aura_flow'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET
        \`name\` = 'Ideogram',
        \`description\` = 'Specializes in soft, atmospheric, dream-like imagery, perfect for ethereal landscapes and mood-based scenes.'
      WHERE \`${serviceCol}\` = 'aura_flow'
    `);
  }

  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const table = await queryRunner.getTable(tableName);
    return !!table?.findColumnByName(columnName);
  }
}
