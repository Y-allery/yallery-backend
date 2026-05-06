import { MigrationInterface, QueryRunner } from 'typeorm';

type AiSettingCostUpdate = {
  service: string;
  cost: number;
  description: string;
};

export class SetAiModelCostsInYeps1778069100000
  implements MigrationInterface
{
  name = 'SetAiModelCostsInYeps1778069100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'aiService',
      'ai_service',
    );

    const updates: AiSettingCostUpdate[] = [
      {
        service: 'aura_flow',
        cost: 161,
        description:
          'Ideogram V2 text-to-image generation. Real provider cost is $0.08/image; app price is 161 YEP, rounded from $0.096/image after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
      {
        service: 'flux',
        cost: 121,
        description:
          'FLUX 1.1 [pro] Ultra high-resolution text-to-image generation. Real provider cost is $0.06/image; app price is 121 YEP, rounded from $0.072/image after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
      {
        service: 'realistic_vision',
        cost: 79,
        description:
          'Realistic Vision photorealistic text-to-image generation. Public model pricing is about $0.039/image; app price is 79 YEP, rounded from $0.0468/image after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
      {
        service: 'flux_pro_fine_tune',
        cost: 141,
        description:
          'Nomisma fine-tuned image generation. The legacy fal model price is $0.07/image; app price is 141 YEP, rounded from $0.084/image after a 20% margin using the 30000 YEP package rate ($17.99). Current main routes this service through the trained Nomisma RunPod LoRA.',
      },
      {
        service: 'grok_image_edit',
        cost: 45,
        description:
          'Grok Imagine image editing. Public pricing is about $0.022/image; app price is 45 YEP, rounded from $0.0264/image after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
      {
        service: 'bytedance_edit',
        cost: 61,
        description:
          'ByteDance SeedEdit v3 image editing. Real provider cost is $0.03/image; app price is 61 YEP, rounded from $0.036/image after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
      {
        service: 'byty_dance',
        cost: 361,
        description:
          'Seedance 1.0 Lite image-to-video generation. Real provider cost is $0.18 per 720p 5s video; app base price is 361 YEP, rounded from $0.216 after a 20% margin using the 30000 YEP package rate ($17.99). 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'kling_text_to_video',
        cost: 701,
        description:
          'Kling 2.5 Turbo Pro text-to-video generation. Real provider cost is $0.07/second, so 5s costs $0.35; app base price is 701 YEP, rounded from $0.42 after a 20% margin using the 30000 YEP package rate ($17.99). 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'mmaudio_v2',
        cost: 17,
        description:
          'MMAudio V2 synchronized audio generation for video. Backend sends duration=8; real provider cost is $0.008/request; app price is 17 YEP, rounded from $0.0096 after a 20% margin using the 30000 YEP package rate ($17.99).',
      },
    ];

    for (const update of updates) {
      await this.applyUpdate(queryRunner, serviceCol, update);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = await this.resolveColumn(
      queryRunner,
      'ai_settings',
      'aiService',
      'ai_service',
    );

    const updates: AiSettingCostUpdate[] = [
      {
        service: 'aura_flow',
        cost: 10,
        description:
          'Ideogram V2 text-to-image generation. Real provider cost is $0.08/image; app price is rounded from $0.096/image after a 20% margin.',
      },
      {
        service: 'flux',
        cost: 8,
        description:
          'FLUX 1.1 [pro] Ultra high-resolution text-to-image generation. Real provider cost is $0.06/image; app price is rounded from $0.072/image after a 20% margin.',
      },
      {
        service: 'realistic_vision',
        cost: 5,
        description:
          'Realistic Vision photorealistic text-to-image generation. Public model pricing is about $0.039/image; app price is rounded from $0.0468/image after a 20% margin.',
      },
      {
        service: 'flux_pro_fine_tune',
        cost: 9,
        description:
          'Nomisma fine-tuned image generation. The legacy fal model price is $0.07/image; app price is rounded from $0.084/image after a 20% margin. Current main routes this service through the trained Nomisma RunPod LoRA.',
      },
      {
        service: 'grok_image_edit',
        cost: 3,
        description:
          'Grok Imagine image editing. Public pricing is about $0.022/image; app price is rounded from $0.0264/image after a 20% margin.',
      },
      {
        service: 'bytedance_edit',
        cost: 4,
        description:
          'ByteDance SeedEdit v3 image editing. Real provider cost is $0.03/image; app price is rounded from $0.036/image after a 20% margin.',
      },
      {
        service: 'byty_dance',
        cost: 22,
        description:
          'Seedance 1.0 Lite image-to-video generation. Real provider cost is $0.18 per 720p 5s video; app base price is rounded from $0.216 after a 20% margin. 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'kling_text_to_video',
        cost: 42,
        description:
          'Kling 2.5 Turbo Pro text-to-video generation. Real provider cost is $0.07/second, so 5s costs $0.35; app base price is rounded from $0.42 after a 20% margin. 10s requests are charged as 2x in backend code.',
      },
      {
        service: 'mmaudio_v2',
        cost: 1,
        description:
          'MMAudio V2 synchronized audio generation for video. Backend sends duration=8; real provider cost is $0.008/request, rounded from $0.0096 after a 20% margin.',
      },
    ];

    for (const update of updates) {
      await this.applyUpdate(queryRunner, serviceCol, update);
    }
  }

  private async applyUpdate(
    queryRunner: QueryRunner,
    serviceCol: string,
    update: AiSettingCostUpdate,
  ): Promise<void> {
    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET
        \`cost\` = ${update.cost},
        \`description\` = ${this.sqlValue(update.description)}
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

  private sqlValue(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
}
