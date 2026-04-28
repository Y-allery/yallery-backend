import { AISettingsMapper } from './ai-settings.mapper';

describe('AISettingsMapper', () => {
  const mapper = new AISettingsMapper();

  it('maps capabilities into admin categories', () => {
    expect(
      mapper.getMediaSettingType({
        capability: 'audio_generate',
        settings: {},
      } as any),
    ).toBe('music');
    expect(
      mapper.getMediaSettingType({
        capability: 'meme_generate',
        settings: {},
      } as any),
    ).toBe('meme');
    expect(
      mapper.getMediaSettingType({
        capability: 'video_generate',
        settings: {},
      } as any),
    ).toBe('video');
    expect(
      mapper.getMediaSettingType({
        capability: 'image_generate',
        settings: { contestOnly: true },
      } as any),
    ).toBe('finetune');
  });

  it('preserves legacy and camelCase response aliases', () => {
    const result = mapper.format({
      id: 10,
      aiService: 'sdxl_lora_generation',
      name: 'SDXL LoRA',
      description: 'Fine-tune image generation',
      provider: 'runpod',
      capability: 'image_generate',
      cost: 25,
      settings: { contestOnly: true },
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as any);

    expect(result).toMatchObject({
      id: 10,
      ai_service: 'sdxl_lora_generation',
      aiService: 'sdxl_lora_generation',
      type: 'finetune',
      category: 'finetune',
      is_active: true,
      isActive: true,
    });
  });
});
