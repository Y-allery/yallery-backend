import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiSettingsTable1764698637531 implements MigrationInterface {
  name = 'CreateAiSettingsTable1764698637531';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`ai_settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`ai_service\` varchar(255) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`allowedOrientations\` json NOT NULL,
        \`minImages\` int NOT NULL,
        \`maxImages\` int NOT NULL,
        \`maxPromptLength\` int NOT NULL,
        \`sizes\` json NULL,
        \`qualityOptions\` json NULL,
        \`styles\` json NULL,
        \`cost\` int NOT NULL,
        \`api_model\` varchar(255) NULL,
        \`description\` text NULL,
        \`is_artem\` tinyint NOT NULL DEFAULT '0',
        \`is_active\` tinyint NOT NULL DEFAULT '1',
        \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_ai_service\` (\`ai_service\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const aiSettings = [
      {
        ai_service: 'aura_flow',
        name: 'Ideogram V2',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 5,
        maxPromptLength: 1000,
        sizes: JSON.stringify(['1024x1024', '1536x640', '768x1344']),
        qualityOptions: null,
        styles: null,
        cost: 20,
        api_model: 'fal-ai/ideogram/v2',
        description: 'High-quality image generation with strong typography and layout handling, well-suited for posters, branding, and design-heavy visuals.',
        is_artem: 0,
        is_active: 1,
      },
      {
        ai_service: 'flux',
        name: 'FLUX AI',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 5,
        maxPromptLength: 1000,
        sizes: JSON.stringify(['1024x1024', '1536x640', '768x1344']),
        qualityOptions: null,
        styles: null,
        cost: 30,
        api_model: 'fal-ai/flux-pro/v1.1-ultra',
        description: 'A versatile model for abstract art, surreal designs, and conceptual visuals.',
        is_artem: 0,
        is_active: 1,
      },
      {
        ai_service: 'realistic_vision',
        name: 'Realistic AI',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 5,
        maxPromptLength: 1000,
        sizes: JSON.stringify(['1024x1024', '1536x640', '768x1344']),
        qualityOptions: null,
        styles: null,
        cost: 11,
        api_model: 'fal-ai/realistic-vision',
        description: 'Excels in detailed, photorealistic images, including lifelike portraits and realistic environments',
        is_artem: 0,
        is_active: 1,
      },
      {
        ai_service: 'flux_pro_fine_tune',
        name: 'Flux PRO Fine Tune',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 2,
        maxPromptLength: 1000,
        sizes: JSON.stringify(['1024x1024', '1536x640', '768x1344']),
        qualityOptions: null,
        styles: null,
        cost: 100,
        api_model: 'fal-ai/flux-pro/v1.1-ultra-finetuned',
        description: 'Advanced model with enhanced customization options for fine-tuned contests',
        is_artem: 0,
        is_active: 1,
      },
      {
        ai_service: 'bytedance_edit',
        name: 'Bytedance Edit',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 1,
        maxPromptLength: 1000,
        sizes: JSON.stringify(['1024x1024', '1536x640', '768x1344']),
        qualityOptions: null,
        styles: null,
        cost: 25,
        api_model: 'fal-ai/bytedance/seededit/v3/edit-image',
        description: 'Specialized for image editing',
        is_artem: 1,
        is_active: 1,
      },
      {
        ai_service: 'x_router',
        name: 'X-Router AI',
        allowedOrientations: JSON.stringify(['horizontal', 'vertical']),
        minImages: 1,
        maxImages: 4,
        maxPromptLength: 3000,
        sizes: JSON.stringify([
          '512x512',
          '768x768',
          '1024x1024',
          '768x1024',
          '1024x768',
          '1280x768',
          '768x1344',
          '1024x1280',
          '1280x1024',
          '1344x768',
        ]),
        qualityOptions: null,
        styles: null,
        cost: 25,
        api_model: null,
        description: 'High-quality image generation with x402 payment integration, supports multiple resolutions, negative prompts, and reproducible results with seed values.',
        is_artem: 0,
        is_active: 1,
      },
    ];

    for (const setting of aiSettings) {
      const descriptionEscaped = setting.description
        ? setting.description.replace(/'/g, "\\'").replace(/"/g, '\\"')
        : null;

      await queryRunner.query(`
        INSERT INTO \`ai_settings\` (
          \`ai_service\`, \`name\`, \`allowedOrientations\`, \`minImages\`, \`maxImages\`,
          \`maxPromptLength\`, \`sizes\`, \`qualityOptions\`, \`styles\`, \`cost\`,
          \`api_model\`, \`description\`, \`is_artem\`, \`is_active\`
        ) VALUES (
          '${setting.ai_service}',
          '${setting.name}',
          '${setting.allowedOrientations}',
          ${setting.minImages},
          ${setting.maxImages},
          ${setting.maxPromptLength},
          '${setting.sizes}',
          ${setting.qualityOptions ? `'${setting.qualityOptions}'` : 'NULL'},
          ${setting.styles ? `'${setting.styles}'` : 'NULL'},
          ${setting.cost},
          ${setting.api_model ? `'${setting.api_model}'` : 'NULL'},
          ${descriptionEscaped ? `'${descriptionEscaped}'` : 'NULL'},
          ${setting.is_artem},
          ${setting.is_active}
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`ai_settings\``);
  }
}
