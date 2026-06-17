import { PromptComposerService } from './prompt-composer.service';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';

describe('PromptComposerService', () => {
  const composer = new PromptComposerService();

  const anime = {
    id: 1,
    name: 'Anime',
    positiveTemplate: 'flat cel-shaded anime illustration',
    negativeTemplate: 'photorealistic, 3d render',
    keywords: ['anime', 'cel shaded'],
    modelOverrides: null,
    recommendedCfg: 7,
    recommendedSteps: 30,
  } as unknown as StyleEntity;

  it('weaves the style into a natural-language prompt for flux (no negative)', () => {
    const result = composer.compose({
      aiService: 'flux2_klein',
      baseDescription: 'a knight on a hill',
      style: anime,
      color: null,
      mode: 'image_generate',
    });

    expect(result.prompt).toContain('a knight on a hill');
    expect(result.prompt).toContain('flat cel-shaded anime illustration');
    expect(result.negativePrompt).toBe('photorealistic, 3d render');
    expect(result.cfg).toBe(7);
    expect(result.steps).toBe(30);
  });

  it('appends comma keywords for SDXL', () => {
    const result = composer.compose({
      aiService: 'sdxl',
      baseDescription: 'a knight on a hill',
      style: anime,
      color: null,
      mode: 'image_generate',
    });

    expect(result.prompt).toBe(
      'a knight on a hill, anime, cel shaded, flat cel-shaded anime illustration',
    );
    expect(result.negativePrompt).toBe('photorealistic, 3d render');
  });

  it('produces an instruction with a style directive for qwen edit', () => {
    const result = composer.compose({
      aiService: 'qwen_image_edit_baked',
      baseDescription: 'Make the sky purple',
      style: anime,
      color: null,
      mode: 'image_edit',
    });

    expect(result.prompt).toBe(
      'Make the sky purple. Render the result in flat cel-shaded anime illustration style.',
    );
    expect(result.negativePrompt).toBe('photorealistic, 3d render');
  });

  it('falls back to the style name when no template is set', () => {
    const nameOnly = { id: 2, name: 'Gothic' } as unknown as StyleEntity;
    const result = composer.compose({
      aiService: 'flux2_klein',
      baseDescription: 'a castle',
      style: nameOnly,
      color: null,
      mode: 'image_generate',
    });

    expect(result.prompt).toContain('rendered in Gothic');
    expect(result.negativePrompt).toBeNull();
    expect(result.cfg).toBeNull();
    expect(result.steps).toBeNull();
  });

  it('respects per-model overrides', () => {
    const styled = {
      id: 3,
      name: 'Anime',
      positiveTemplate: 'base anime',
      keywords: ['anime'],
      modelOverrides: { sdxl: { keywords: ['anime', 'masterpiece'], positive: 'sdxl anime' } },
    } as unknown as StyleEntity;

    const result = composer.compose({
      aiService: 'sdxl',
      baseDescription: 'a cat',
      style: styled,
      color: null,
      mode: 'image_generate',
    });

    expect(result.prompt).toBe('a cat, anime, masterpiece, sdxl anime');
  });

  it('adds a color palette phrase', () => {
    const result = composer.compose({
      aiService: 'flux2_klein',
      baseDescription: 'a forest',
      style: null,
      color: { id: 1, name: 'nature' } as any,
      mode: 'image_generate',
    });

    expect(result.prompt).toContain('nature-inspired palette');
  });
});
