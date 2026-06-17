import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStylePromptFields1782000100000 implements MigrationInterface {
  name = 'AddStylePromptFields1782000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`styles\`
        ADD COLUMN \`positiveTemplate\` text NULL,
        ADD COLUMN \`negativeTemplate\` text NULL,
        ADD COLUMN \`keywords\` json NULL,
        ADD COLUMN \`modelOverrides\` json NULL,
        ADD COLUMN \`recommendedCfg\` float NULL,
        ADD COLUMN \`recommendedSteps\` int NULL
    `);

    // Non-destructive backfill: enrich a few well-known styles by name if they
    // already exist and have no template yet. Idempotent and safe to no-op when
    // names don't match — untemplated styles still work (composer uses the name).
    await queryRunner.query(`
      UPDATE \`styles\`
      SET \`positiveTemplate\` = 'flat cel-shaded anime illustration, clean bold linework, vibrant saturated colors, expressive eyes',
          \`negativeTemplate\` = 'photorealistic, 3d render, photograph, realistic skin texture',
          \`keywords\` = JSON_ARRAY('anime', 'cel shaded', 'vibrant colors', 'clean lineart')
      WHERE LOWER(\`name\`) = 'anime' AND \`positiveTemplate\` IS NULL
    `);
    await queryRunner.query(`
      UPDATE \`styles\`
      SET \`positiveTemplate\` = 'photorealistic, lifelike detail, natural skin texture, realistic lighting, shallow depth of field, shot on a full-frame camera',
          \`negativeTemplate\` = 'cartoon, anime, illustration, painting, cgi, plastic skin, oversaturated',
          \`keywords\` = JSON_ARRAY('photorealistic', 'realistic', 'detailed', 'natural lighting')
      WHERE LOWER(\`name\`) IN ('realistic', 'realism', 'photorealistic') AND \`positiveTemplate\` IS NULL
    `);
    await queryRunner.query(`
      UPDATE \`styles\`
      SET \`positiveTemplate\` = 'cyberpunk aesthetic, neon-lit night city, glowing signage, rain-soaked streets, high-contrast moody lighting, futuristic',
          \`negativeTemplate\` = 'daylight, rural, vintage, muted colors, flat lighting',
          \`keywords\` = JSON_ARRAY('cyberpunk', 'neon', 'futuristic', 'sci-fi')
      WHERE LOWER(\`name\`) = 'cyberpunk' AND \`positiveTemplate\` IS NULL
    `);
    await queryRunner.query(`
      UPDATE \`styles\`
      SET \`positiveTemplate\` = 'stylized 3d render, physically based materials, soft global illumination, subtle subsurface scattering, polished cgi',
          \`negativeTemplate\` = 'flat 2d, hand-drawn, sketch, low-poly, jpeg artifacts',
          \`keywords\` = JSON_ARRAY('3d render', 'cgi', 'octane render', 'pbr')
      WHERE LOWER(\`name\`) IN ('3d', '3d render', 'cgi') AND \`positiveTemplate\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`styles\`
        DROP COLUMN \`positiveTemplate\`,
        DROP COLUMN \`negativeTemplate\`,
        DROP COLUMN \`keywords\`,
        DROP COLUMN \`modelOverrides\`,
        DROP COLUMN \`recommendedCfg\`,
        DROP COLUMN \`recommendedSteps\`
    `);
  }
}
