import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the production Krea 2 model rows and preserves SDXL rows as inactive
 * history. The Krea rows intentionally start dark: operations enables them only
 * after the matching RunPod endpoints pass smoke tests.
 */
export class ReplaceSdxlRuntimeWithKrea21785500000000
  implements MigrationInterface
{
  name = 'ReplaceSdxlRuntimeWithKrea21785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`ai_finetunes\`
        ADD COLUMN \`loraSha256\` varchar(64) NULL AFTER \`loraUrl\`,
        ADD COLUMN \`loraStep\` int NULL AFTER \`loraSha256\`,
        ADD COLUMN \`inferenceModel\` varchar(255) NULL AFTER \`loraStep\`,
        MODIFY COLUMN \`modelFamily\` varchar(32) NOT NULL DEFAULT 'krea2',
        MODIFY COLUMN \`baseModel\` varchar(255) NOT NULL DEFAULT 'krea/Krea-2-Raw'
    `);

    await queryRunner.query(`
      UPDATE \`ai_finetunes\`
      SET
        \`loraSha256\` = COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.output.loraSha256')), 'null'),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.loraSha256')), 'null')
        ),
        \`loraStep\` = COALESCE(
          CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.output.loraStep')), 'null') AS UNSIGNED),
          CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.loraStep')), 'null') AS UNSIGNED)
        ),
        \`inferenceModel\` = COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.output.inferenceModel')), 'null'),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`rawOutput\`, '$.inferenceModel')), 'null')
        )
      WHERE \`modelFamily\` = 'krea2'
    `);

    await queryRunner.query(`
      UPDATE \`ai_finetunes\`
      SET
        \`status\` = 'failed',
        \`errorMessage\` = COALESCE(
          \`errorMessage\`,
          'SDXL fine-tuning was retired during the Krea 2 production cutover.'
        )
      WHERE \`modelFamily\` = 'sdxl'
        AND \`status\` IN ('pending', 'queued', 'training')
    `);

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
        'krea2_turbo',
        'Krea 2 Turbo',
        'Prompt-to-image generation on Krea 2 Turbo through a private RunPod endpoint.',
        'runpod',
        'image_generate',
        COALESCE((
          SELECT \`cost\`
          FROM \`media_ai_settings\`
          WHERE \`aiService\` = 'sdxl'
            AND \`capability\` = 'image_generate'
          LIMIT 1
        ), 50),
        JSON_SET(
          COALESCE((
            SELECT \`settings\`
            FROM \`media_ai_settings\`
            WHERE \`aiService\` = 'sdxl'
              AND \`capability\` = 'image_generate'
            LIMIT 1
          ), JSON_OBJECT()),
          '$.minImages',
          1,
          '$.maxImages',
          4,
          '$.contestOnly',
          false
        ),
        0
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`description\` = VALUES(\`description\`),
        \`provider\` = VALUES(\`provider\`),
        \`cost\` = VALUES(\`cost\`),
        \`settings\` = VALUES(\`settings\`),
        \`isActive\` = 0
    `);

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
        'krea2_lora_finetune',
        'Krea 2 Raw LoRA Fine-tune',
        'Trains Krea-2-Raw LoRA profiles and validates them on Krea 2 Turbo.',
        'runpod',
        'finetune_train',
        0,
        JSON_OBJECT('contestOnly', true),
        0
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`description\` = VALUES(\`description\`),
        \`provider\` = VALUES(\`provider\`),
        \`cost\` = VALUES(\`cost\`),
        \`settings\` = VALUES(\`settings\`),
        \`isActive\` = 0
    `);

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
        'krea2_lora_generation',
        'Krea 2 LoRA Contest Generation',
        'Generates fine-tune contest images on Krea 2 Turbo with a validated Krea-2-Raw LoRA.',
        'runpod',
        'image_generate',
        COALESCE((
          SELECT \`cost\`
          FROM \`media_ai_settings\`
          WHERE \`aiService\` = 'sdxl_lora_generation'
            AND \`capability\` = 'image_generate'
          LIMIT 1
        ), 12),
        JSON_SET(
          COALESCE((
            SELECT \`settings\`
            FROM \`media_ai_settings\`
            WHERE \`aiService\` = 'sdxl_lora_generation'
              AND \`capability\` = 'image_generate'
            LIMIT 1
          ), JSON_OBJECT()),
          '$.minImages',
          1,
          '$.maxImages',
          4,
          '$.contestOnly',
          true
        ),
        0
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`),
        \`description\` = VALUES(\`description\`),
        \`provider\` = VALUES(\`provider\`),
        \`cost\` = VALUES(\`cost\`),
        \`settings\` = VALUES(\`settings\`),
        \`isActive\` = 0
    `);

    await queryRunner.query(`
      UPDATE \`contests\` contest
      INNER JOIN \`media_ai_settings\` legacy
        ON legacy.\`id\` = contest.\`mediaAiSettingId\`
      INNER JOIN \`media_ai_settings\` replacement
        ON replacement.\`aiService\` = 'krea2_lora_generation'
        AND replacement.\`capability\` = 'image_generate'
      SET contest.\`mediaAiSettingId\` = replacement.\`id\`
      WHERE legacy.\`aiService\` IN (
        'sdxl_lora_generation',
        'sdxl_lora_finetune'
      )
        OR (
          legacy.\`aiService\` = 'sdxl'
          AND contest.\`contestType\` = 'fine_tune'
        )
    `);

    await queryRunner.query(`
      UPDATE \`contests\` contest
      INNER JOIN \`media_ai_settings\` legacy
        ON legacy.\`id\` = contest.\`mediaAiSettingId\`
      INNER JOIN \`media_ai_settings\` replacement
        ON replacement.\`aiService\` = 'krea2_turbo'
        AND replacement.\`capability\` = 'image_generate'
      SET contest.\`mediaAiSettingId\` = replacement.\`id\`
      WHERE legacy.\`aiService\` = 'sdxl'
    `);

    await queryRunner.query(`
      UPDATE \`media_ai_settings\`
      SET \`isActive\` = 0
      WHERE \`aiService\` IN (
        'sdxl',
        'sdxl_lora_finetune',
        'sdxl_lora_generation'
      )
    `);

    await queryRunner.query(`
      UPDATE \`provider_runtime_settings\`
      SET \`valuePlain\` = 'krea2_turbo'
      WHERE \`key\` = 'DEFAULT_PROMPT_IMAGE_CONTEST_AI_SERVICE'
        AND \`valuePlain\` IN ('sdxl', 'sdxl_lora_generation')
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // This cutover rewires historical contest foreign keys and adds artifact
    // integrity metadata that must never be discarded. Reverting it
    // automatically would either corrupt provenance or route new Krea contests
    // to retired SDXL workers. Application rollback is supported without
    // reverting this data migration; a reverse model migration must be a
    // separately reviewed operation with an explicit mapping.
    throw new Error(
      'Krea 2 cutover is intentionally irreversible; deploy a reviewed forward migration to restore SDXL.',
    );
  }
}
