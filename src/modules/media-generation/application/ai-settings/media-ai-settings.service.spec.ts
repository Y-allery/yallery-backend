import { MediaAISettingsService } from 'src/modules/media-generation/application/ai-settings/media-ai-settings.service';

describe('MediaAISettingsService', () => {
  const createService = ({
    mediaSettings = [],
    colors = [],
    styles = [],
  }: {
    mediaSettings?: any[];
    colors?: any[];
    styles?: any[];
  }) => {
    return new MediaAISettingsService(
      {
        getString: jest.fn(async () => null),
      } as any,
      {
        describeRoutes: jest.fn().mockReturnValue([]),
      } as any,
      {
        resolveVideoGenerationCost: jest.fn(),
        buildVideoAISettingsPayload: jest.fn(),
      } as any,
      {
        find: jest.fn().mockResolvedValue(mediaSettings),
        findOne: jest.fn(),
      } as any,
      {
        find: jest.fn().mockResolvedValue(colors),
      } as any,
      {
        find: jest.fn().mockResolvedValue(styles),
      } as any,
    );
  };

  it('keeps Z-Image as the default while exposing Krea 2 as the SDXL replacement', async () => {
    const service = createService({
      mediaSettings: [
        {
          aiService: 'flux2_klein',
          name: 'FLUX.2 Klein',
          cost: 60,
          description: 'Fast image generation',
          settings: {
            minImages: 1,
            maxImages: 1,
          },
        },
        {
          aiService: 'krea2_turbo',
          name: 'Krea 2 Turbo',
          cost: 50,
          description: 'Standard image generation',
          settings: {
            minImages: 1,
            maxImages: 5,
          },
        },
        {
          aiService: 'z_image_turbo',
          name: 'Z-Image Turbo',
          cost: 50,
          description: 'Platform default image generation',
          settings: {
            minImages: 1,
            maxImages: 4,
          },
        },
      ],
    });

    await expect(service.getPromptImageAISettings()).resolves.toMatchObject({
      defaultSettings: {
        defaultAI: 'z_image_turbo',
        defaultOrientations: 'horizontal',
      },
    });
  });

  it('returns only Krea 2 LoRA generation settings for fine-tune prompt images', async () => {
    const service = createService({
      mediaSettings: [
        {
          aiService: 'krea2_lora_generation',
          name: 'Krea 2 LoRA Generation',
          cost: 20,
          description: 'Fine-tune contest image generation',
          settings: {
            minImages: 1,
            maxImages: 1,
            maxPromptLength: 300,
          },
        },
      ],
      colors: [{ id: 1, name: 'Warm' }],
      styles: [{ id: 2, name: 'Cinematic', imageUrl: 'style.png' }],
    });

    await expect(service.getFineTunePromptImageAISettings()).resolves.toEqual({
      defaultSettings: {
        defaultAI: 'krea2_lora_generation',
        defaultOrientations: 'horizontal',
        defaultStyleId: 2,
      },
      aiSettings: [
        expect.objectContaining({
          aiService: 'krea2_lora_generation',
          minImages: 1,
          maxImages: 1,
          maxPromptLength: 300,
        }),
      ],
      colors: [{ id: 1, name: 'Warm' }],
      styles: [{ id: 2, name: 'Cinematic', imageUrl: 'style.png' }],
    });
  });

  describe('getEditImageAISettings', () => {
    const editSetting = (settings: Record<string, unknown>) => ({
      mediaSettings: [
        {
          aiService: 'qwen_image_edit_baked',
          name: 'Qwen Image Edit',
          cost: 80,
          description: 'Edit an image',
          settings,
        },
      ],
      colors: [{ id: 1, name: 'Warm' }],
      styles: [{ id: 2, name: 'Cinematic', imageUrl: 'style.png' }],
    });

    it('exposes the reference-image limits without disturbing the output-count limits', async () => {
      const service = createService(
        editSetting({
          minImages: 1,
          maxImages: 1,
          minReferenceImages: 1,
          maxReferenceImages: 3,
        }),
      );

      const result = await service.getEditImageAISettings();

      expect(result.aiSettings[0]).toEqual(
        expect.objectContaining({
          aiService: 'qwen_image_edit_baked',
          minReferenceImages: 1,
          maxReferenceImages: 3,
          // REGRESSION GUARD: shipped app builds bind maxImages to the OUTPUT quantity stepper
          // and to `cost * quantity`. If it ever drifts to 3 here, every existing client starts
          // showing a 1/3 stepper and pre-charging triple.
          minImages: 1,
          maxImages: 1,
        }),
      );
    });

    it('defaults to a single reference for a row that has not opted in', async () => {
      const service = createService(
        editSetting({ minImages: 1, maxImages: 1 }),
      );

      expect((await service.getEditImageAISettings()).aiSettings[0]).toEqual(
        expect.objectContaining({
          minReferenceImages: 1,
          maxReferenceImages: 1,
        }),
      );
    });

    it('clamps an over-configured maximum down to the worker ceiling', async () => {
      const service = createService(
        editSetting({ minReferenceImages: 1, maxReferenceImages: 10 }),
      );

      expect((await service.getEditImageAISettings()).aiSettings[0]).toEqual(
        expect.objectContaining({ maxReferenceImages: 3 }),
      );
    });
  });

  describe('maxPromptLength', () => {
    // The app reads this at the TOP level of each aiSettings item
    // (MediaAiModel.fromJson -> map['maxPromptLength']), not nested under settings.
    const row = (
      aiService: string,
      settings: Record<string, unknown> | null,
    ) => ({
      aiService,
      name: aiService,
      cost: 10,
      description: null,
      settings,
    });

    it('advertises 500 characters on every capability that takes a prompt', async () => {
      const service = createService({
        mediaSettings: [
          row('z_image_turbo', { minImages: 1, maxImages: 4 }),
          row('krea2_lora_generation', null),
          row('qwen_image_edit_baked', null),
          row('mmaudio_v2', null),
          row('p_video_text', null),
          row('p_video_image', null),
          row('wan22_animate_native', null),
        ],
      });

      const responses = await Promise.all([
        service.getPromptImageAISettings(),
        service.getFineTunePromptImageAISettings(),
        service.getEditImageAISettings(),
        service.getAudioAISettings(),
        service.getTextVideoAISettings(),
        service.getImageVideoAISettings(),
        service.getMemeAISettings(),
      ]);

      for (const response of responses) {
        expect(response.aiSettings.length).toBeGreaterThan(0);
        for (const item of response.aiSettings) {
          expect(item).toEqual(
            expect.objectContaining({ maxPromptLength: 500 }),
          );
        }
      }
    });

    it('lets a per-model row override the default without a deploy', async () => {
      const service = createService({
        mediaSettings: [
          row('z_image_turbo', {
            minImages: 1,
            maxImages: 4,
            maxPromptLength: 1200,
          }),
        ],
      });

      expect((await service.getPromptImageAISettings()).aiSettings[0]).toEqual(
        expect.objectContaining({ maxPromptLength: 1200 }),
      );
    });
  });
});
