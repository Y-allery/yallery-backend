import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retires the vendor-shaped aiService ids in favour of product ids.
 *
 * The id is not internal: it is returned in every ai-settings response and echoed back in
 * every generation request, so `z_image_turbo` or `qwen_image_edit_baked` published the
 * engine behind the product to anyone reading a response — which matters now that the API
 * is being sold to third parties.
 *
 * Application code accepts both spellings (normalizeAiService), so clients already in the
 * wild keep working; this moves the stored data so nothing new is written under a retired
 * id and historical posts stop leaking one.
 */
const RENAMES: ReadonlyArray<[legacy: string, canonical: string]> = [
  ['z_image_turbo', 'yengine_photo'],
  ['krea2_turbo', 'yengine_photo_pro'],
  ['flux2_klein', 'yengine_photo_lite'],
  ['qwen_image', 'yengine_photo_v1'],
  ['qwen_image_2512', 'yengine_photo_v2'],
  ['sdxl', 'yengine_photo_legacy'],
  ['krea2_lora_generation', 'yengine_portrait'],
  ['flux_fine_tune', 'yengine_portrait_pro'],
  ['sdxl_lora_generation', 'yengine_portrait_legacy'],
  ['qwen_image_edit_baked', 'yengine_edit'],
  ['krea2_lora_finetune', 'yengine_portrait_trainer'],
  ['sdxl_lora_finetune', 'yengine_portrait_trainer_legacy'],
  ['mmaudio_v2', 'yengine_audio'],
  ['p_video_text', 'yengine_video_text'],
  ['p_video_image', 'yengine_video_image'],
  ['wan22_animate_native', 'yengine_meme'],
  ['ltx_meme', 'yengine_meme_lite'],

  // Engines retired before this module; present only in stored posts, but the id is
  // published in the feed all the same.
  ['flux', 'yengine_photo_legacy'],
  ['flux_schnell', 'yengine_photo_legacy'],
  ['aura_flow', 'yengine_photo_legacy'],
  ['realistic_vision', 'yengine_photo_legacy'],
  ['nano_banana', 'yengine_photo_legacy'],
  ['x_router', 'yengine_photo_legacy'],
  ['flux_pro_fine_tune', 'yengine_portrait_pro'],
  ['bytedance_edit', 'yengine_edit_legacy'],
  ['grok_image_edit', 'yengine_edit_legacy'],
  ['qwen_image_edit', 'yengine_edit_legacy'],
  ['kling_text_to_video', 'yengine_video_legacy'],
  ['kling_v26_std_motion_control', 'yengine_meme_legacy'],
  ['byty_dance', 'yengine_meme_legacy'],
];

/** Runtime settings whose stored VALUE is an aiService id. */
const SETTING_KEYS = [
  'DEFAULT_PROMPT_IMAGE_AI_SERVICE',
  'MEME_AI_SERVICE_OVERRIDE',
  'IMAGE_AI_SERVICE_OVERRIDE',
];

export class RenameAiServicesToYengineIds1786100000000
  implements MigrationInterface
{
  name = 'RenameAiServicesToYengineIds1786100000000';

  private async apply(
    queryRunner: QueryRunner,
    pairs: ReadonlyArray<[string, string]>,
  ): Promise<void> {
    for (const [from, to] of pairs) {
      await queryRunner.query(
        `UPDATE \`media_ai_settings\` SET \`aiService\` = ? WHERE \`aiService\` = ?`,
        [to, from],
      );

      for (const key of SETTING_KEYS) {
        await queryRunner.query(
          `UPDATE \`provider_runtime_settings\` SET \`valuePlain\` = ?
            WHERE \`key\` = ? AND \`valuePlain\` = ?`,
          [to, key, from],
        );
      }

      // Historical posts: the id is echoed to the client in the feed and in the
      // regenerate flow, so leaving it would keep publishing the retired name. Indexed
      // by the JSON path rather than a table scan of every row's document.
      await queryRunner.query(
        `UPDATE \`posts\`
            SET \`generationParams\` = JSON_SET(\`generationParams\`, '$.aiService', ?)
          WHERE JSON_UNQUOTE(JSON_EXTRACT(\`generationParams\`, '$.aiService')) = ?`,
        [to, from],
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.apply(queryRunner, RENAMES);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.apply(
      queryRunner,
      RENAMES.map(
        ([legacy, canonical]) => [canonical, legacy] as [string, string],
      ),
    );
  }
}
