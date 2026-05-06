import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContestMediaAiSetting1769004100000
  implements MigrationInterface
{
  name = 'AddContestMediaAiSetting1769004100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const legacyFineTuneRows = await queryRunner.query(`
      SELECT \`name\`, \`description\`, \`cost\`
      FROM \`ai_settings\`
      WHERE \`aiService\` = 'flux_pro_fine_tune'
      LIMIT 1
    `);

    const legacyFineTune = legacyFineTuneRows[0] ?? null;
    const fineTuneName = String(
      legacyFineTune?.name ?? 'FLUX Fine Tune',
    ).replace(/'/g, "''");
    const fineTuneDescription = String(
      legacyFineTune?.description ??
        'Contest fine-tuned prompt-to-image generation powered by Fal AI.',
    ).replace(/'/g, "''");

    await queryRunner.query(`
      INSERT INTO \`media_ai_settings\` (
        \`aiService\`,
        \`name\`,
        \`description\`,
        \`provider\`,
        \`capability\`,
        \`cost\`,
        \`settings\`,
        \`isActive\`
      )
      SELECT
        'flux_fine_tune',
        '${fineTuneName}',
        '${fineTuneDescription}',
        'fal_ai',
        'image_generate',
        ${Number(legacyFineTune?.cost ?? 30)},
        JSON_OBJECT('contestOnly', true),
        1
      WHERE NOT EXISTS (
        SELECT 1
        FROM \`media_ai_settings\`
        WHERE \`aiService\` = 'flux_fine_tune'
          AND \`capability\` = 'image_generate'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE \`contests\`
      ADD COLUMN \`mediaAiSettingId\` int NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_contests_mediaAiSettingId\`
      ON \`contests\` (\`mediaAiSettingId\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`contests\`
      ADD CONSTRAINT \`FK_contests_mediaAiSettingId\`
      FOREIGN KEY (\`mediaAiSettingId\`)
      REFERENCES \`media_ai_settings\`(\`id\`)
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    const nanoBananaRows = await queryRunner.query(`
      SELECT \`id\`
      FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'nano_banana'
        AND \`capability\` = 'image_generate'
      LIMIT 1
    `);

    const fineTuneRows = await queryRunner.query(`
      SELECT \`id\`
      FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'flux_fine_tune'
        AND \`capability\` = 'image_generate'
      LIMIT 1
    `);

    const nanoBananaId = nanoBananaRows[0]?.id ?? null;
    const fineTuneId = fineTuneRows[0]?.id ?? null;

    if (nanoBananaId) {
      await queryRunner.query(`
        UPDATE \`contests\`
        SET \`mediaAiSettingId\` = ${Number(nanoBananaId)}
        WHERE \`mediaAiSettingId\` IS NULL
          AND \`contestType\` = 'DEFAULT'
      `);
    }

    if (fineTuneId) {
      await queryRunner.query(`
        UPDATE \`contests\`
        SET \`mediaAiSettingId\` = ${Number(fineTuneId)}
        WHERE \`mediaAiSettingId\` IS NULL
          AND \`contestType\` = 'FINE_TUNE'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`contests\`
      DROP FOREIGN KEY \`FK_contests_mediaAiSettingId\`
    `);

    await queryRunner.query(`
      DROP INDEX \`IDX_contests_mediaAiSettingId\`
      ON \`contests\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`contests\`
      DROP COLUMN \`mediaAiSettingId\`
    `);

    await queryRunner.query(`
      DELETE FROM \`media_ai_settings\`
      WHERE \`aiService\` = 'flux_fine_tune'
        AND \`capability\` = 'image_generate'
    `);
  }
}
