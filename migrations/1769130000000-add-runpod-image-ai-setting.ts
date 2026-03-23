import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRunpodImageAiSetting1769130000000
  implements MigrationInterface
{
  name = 'AddRunpodImageAiSetting1769130000000';

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
    const serviceCol = (await this.columnExists(
      queryRunner,
      'ai_settings',
      'aiService',
    ))
      ? 'aiService'
      : 'ai_service';
    const modelCol = (await this.columnExists(
      queryRunner,
      'ai_settings',
      'apiModel',
    ))
      ? 'apiModel'
      : 'api_model';
    const isActiveCol = (await this.columnExists(
      queryRunner,
      'ai_settings',
      'isActive',
    ))
      ? 'isActive'
      : 'is_active';
    const isArtemCol = (await this.columnExists(
      queryRunner,
      'ai_settings',
      'isArtem',
    ))
      ? 'isArtem'
      : 'is_artem';

    const existing = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'runpod_image'
    `);

    if (Number(existing?.[0]?.count ?? 0) > 0) {
      return;
    }

    await queryRunner.query(`
      INSERT IGNORE INTO \`ai_settings\` (
        \`${serviceCol}\`, \`name\`, \`allowedOrientations\`, \`minImages\`, \`maxImages\`,
        \`maxPromptLength\`, \`sizes\`, \`qualityOptions\`, \`styles\`, \`cost\`,
        \`${modelCol}\`, \`description\`, \`type\`, \`${isArtemCol}\`, \`${isActiveCol}\`
      ) VALUES (
        'runpod_image',
        'RunPod Image',
        '[\"horizontal\",\"vertical\"]',
        1,
        4,
        4000,
        '[\"768x1344\",\"1344x768\"]',
        NULL,
        NULL,
        30,
        'segmind/SSD-1B',
        'RunPod-backed image generation policy for the new media-generation module.',
        'image',
        0,
        1
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(
      queryRunner,
      'ai_settings',
      'aiService',
    ))
      ? 'aiService'
      : 'ai_service';

    await queryRunner.query(`
      DELETE FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'runpod_image' AND \`type\` = 'image'
    `);
  }
}
