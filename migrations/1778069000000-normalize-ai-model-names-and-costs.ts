import { MigrationInterface, QueryRunner } from 'typeorm';

type AiSettingUpdate = {
  service: string;
  name: string;
  cost: number;
  description: string;
  apiModel?: string | null;
};

export class NormalizeAiModelNamesAndCosts1778069000000
  implements MigrationInterface
{
  name = 'NormalizeAiModelNamesAndCosts1778069000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'aiService',
      'ai_service',
    );
    const modelCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'apiModel',
      'api_model',
    );

    const updates: AiSettingUpdate[] = [
      {
        service: 'aura_flow',
        name: 'Ideogram V2',
        cost: 10,
        apiModel: 'fal-ai/ideogram/v2',
        description:
          'Ideogram V2 text-to-image generation. Real provider cost is $0.08/image; app price is rounded from $0.096/image after a 20% margin.',
      },
      {
        service: 'flux',
        name: 'FLUX 1.1 [pro] Ultra',
        cost: 8,
        apiModel: 'fal-ai/flux-pro/v1.1-ultra',
        description:
          'FLUX 1.1 [pro] Ultra high-resolution text-to-image generation. Real provider cost is $0.06/image; app price is rounded from $0.072/image after a 20% margin.',
      },
      {
        service: 'realistic_vision',
        name: 'Realistic Vision',
        cost: 5,
        apiModel: 'fal-ai/realistic-vision',
        description:
          'Realistic Vision photorealistic text-to-image generation. Public model pricing is about $0.039/image; app price is rounded from $0.0468/image after a 20% margin.',
      },
      {
        service: 'flux_pro_fine_tune',
        name: 'Nomisma Style Fine Tune',
        cost: 9,
        description:
          'Nomisma fine-tuned image generation. The legacy fal model price is $0.07/image; app price is rounded from $0.084/image after a 20% margin. Current main routes this service through the trained Nomisma RunPod LoRA.',
      },
      {
        service: 'grok_image_edit',
        name: 'Grok Imagine Image Edit',
        cost: 3,
        apiModel: 'xai/grok-imagine-image/edit',
        description:
          'Grok Imagine image editing. Public pricing is about $0.022/image; app price is rounded from $0.0264/image after a 20% margin.',
      },
      {
        service: 'bytedance_edit',
        name: 'SeedEdit v3 Image Edit',
        cost: 4,
        apiModel: 'fal-ai/bytedance/seededit/v3/edit-image',
        description:
          'ByteDance SeedEdit v3 image editing. Real provider cost is $0.03/image; app price is rounded from $0.036/image after a 20% margin.',
      },
      {
        service: 'x_router',
        name: 'X-Router Flux Schnell',
        cost: 25,
        description:
          'External x402 image generation route currently configured with X_ROUTER_MODEL=flux-schnell. Cost is left unchanged until X-Router billing is normalized separately.',
      },
      {
        service: 'byty_dance',
        name: 'Seedance 1.0 Lite Image-to-Video',
        cost: 22,
        apiModel: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
        description:
          'Seedance 1.0 Lite image-to-video generation. Real provider cost is $0.18 per 720p 5s video; app base price is rounded from $0.216 after a 20% margin. 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'kling_text_to_video',
        name: 'Kling 2.5 Turbo Pro Text-to-Video',
        cost: 42,
        apiModel: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        description:
          'Kling 2.5 Turbo Pro text-to-video generation. Real provider cost is $0.07/second, so 5s costs $0.35; app base price is rounded from $0.42 after a 20% margin. 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'mmaudio_v2',
        name: 'MMAudio V2 Video-to-Audio',
        cost: 1,
        apiModel: 'fal-ai/mmaudio-v2',
        description:
          'MMAudio V2 synchronized audio generation for video. Backend sends duration=8; real provider cost is $0.008/request, rounded from $0.0096 after a 20% margin.',
      },
    ];

    for (const update of updates) {
      await this.applyUpdate(queryRunner, serviceCol, modelCol, update);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'aiService',
      'ai_service',
    );
    const modelCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'apiModel',
      'api_model',
    );

    const updates: AiSettingUpdate[] = [
      {
        service: 'aura_flow',
        name: 'Ideogram V2',
        cost: 20,
        apiModel: 'fal-ai/ideogram/v2',
        description:
          'High-quality image generation with strong typography and layout handling, well-suited for posters, branding, and design-heavy visuals.',
      },
      {
        service: 'flux',
        name: 'FLUX AI',
        cost: 30,
        apiModel: 'fal-ai/flux-pro/v1.1-ultra',
        description:
          'A versatile model for abstract art, surreal designs, and conceptual visuals.',
      },
      {
        service: 'realistic_vision',
        name: 'Realistic AI',
        cost: 11,
        apiModel: 'fal-ai/realistic-vision',
        description:
          'Excels in detailed, photorealistic images, including lifelike portraits and realistic environments',
      },
      {
        service: 'flux_pro_fine_tune',
        name: 'Flux PRO Fine Tune',
        cost: 100,
        apiModel: 'fal-ai/flux-pro/v1.1-ultra-finetuned',
        description:
          'Advanced model with enhanced customization options for fine-tuned contests',
      },
      {
        service: 'grok_image_edit',
        name: 'Grok Edit',
        cost: 25,
        apiModel: 'xai/grok-imagine-image/edit',
        description: 'Edit images using Grok Imagine.',
      },
      {
        service: 'bytedance_edit',
        name: 'Bytedance Edit',
        cost: 25,
        apiModel: 'fal-ai/bytedance/seededit/v3/edit-image',
        description: 'Specialized for image editing',
      },
      {
        service: 'x_router',
        name: 'X-Router AI',
        cost: 25,
        description:
          'High-quality image generation with x402 payment integration, supports multiple resolutions, negative prompts, and reproducible results with seed values.',
      },
      {
        service: 'byty_dance',
        name: 'Byty Dance',
        cost: 100,
        apiModel: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
        description:
          'Create animated videos from your image with BytyDance.',
      },
      {
        service: 'kling_text_to_video',
        name: 'Kling Text-to-Video',
        cost: 100,
        apiModel: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        description: 'Generate video from text prompt using Kling (text-to-video).',
      },
      {
        service: 'mmaudio_v2',
        name: 'MMAudio V2 Video-to-Video',
        cost: 100,
        apiModel: 'fal-ai/mmaudio-v2',
        description:
          'Generate synchronized audio for a video based on a text prompt, returning a new video with an audio track.',
      },
    ];

    for (const update of updates) {
      await this.applyUpdate(queryRunner, serviceCol, modelCol, update);
    }
  }

  private async applyUpdate(
    queryRunner: QueryRunner,
    serviceCol: string,
    modelCol: string,
    update: AiSettingUpdate,
  ): Promise<void> {
    const modelSql =
      update.apiModel === undefined
        ? ''
        : `, \`${modelCol}\` = ${this.sqlValue(update.apiModel)}`;

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET
        \`name\` = ${this.sqlValue(update.name)},
        \`cost\` = ${update.cost},
        \`description\` = ${this.sqlValue(update.description)}
        ${modelSql}
      WHERE \`${serviceCol}\` = ${this.sqlValue(update.service)}
    `);
  }

  private async resolveColumn(
    queryRunner: QueryRunner,
    tableName: string,
    preferredName: string,
    fallbackName: string,
  ): Promise<string> {
    return (await this.columnExists(queryRunner, tableName, preferredName))
      ? preferredName
      : fallbackName;
  }

  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const table = await queryRunner.getTable(tableName);
    return !!table?.findColumnByName(columnName);
  }

  private sqlValue(value: string | null): string {
    if (value === null) {
      return 'NULL';
    }

    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
}
