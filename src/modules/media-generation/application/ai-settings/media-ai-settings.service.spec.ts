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

  it('uses SDXL as the default prompt image model', async () => {
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
          aiService: 'sdxl',
          name: 'SDXL',
          cost: 50,
          description: 'Standard image generation',
          settings: {
            minImages: 1,
            maxImages: 5,
          },
        },
      ],
    });

    await expect(service.getPromptImageAISettings()).resolves.toMatchObject({
      defaultSettings: {
        defaultAI: 'sdxl',
        defaultOrientations: 'horizontal',
      },
    });
  });

  it('returns only SDXL LoRA generation settings for fine-tune prompt images', async () => {
    const service = createService({
      mediaSettings: [
        {
          aiService: 'sdxl_lora_generation',
          name: 'SDXL LoRA Generation',
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
        defaultAI: 'sdxl_lora_generation',
        defaultOrientations: 'horizontal',
        defaultStyleId: 2,
      },
      aiSettings: [
        expect.objectContaining({
          aiService: 'sdxl_lora_generation',
          minImages: 1,
          maxImages: 1,
          maxPromptLength: 300,
        }),
      ],
      colors: [{ id: 1, name: 'Warm' }],
      styles: [{ id: 2, name: 'Cinematic', imageUrl: 'style.png' }],
    });
  });
});
