import { MediaAISettingsService } from './media-ai-settings.service';

const STYLES = [
  { id: 10, name: 'Cinematic', imageUrl: 'a.png' },
  { id: 11, name: 'Fantasy Art', imageUrl: 'b.png' },
  { id: 12, name: 'Hyperrealism', imageUrl: 'c.png' },
  { id: 13, name: '3D Model', imageUrl: 'd.png' },
];

const createService = (defaultStyleId: string | null) =>
  new MediaAISettingsService(
    {
      getString: jest.fn(async (key: string) =>
        key === 'DEFAULT_PROMPT_IMAGE_STYLE_ID' ? defaultStyleId : null,
      ),
    } as any,
    { describeRoutes: jest.fn().mockReturnValue([]) } as any,
    {
      resolveVideoGenerationCost: jest.fn(),
      buildVideoAISettingsPayload: jest.fn(),
    } as any,
    {
      find: jest.fn().mockResolvedValue([
        {
          aiService: 'sdxl',
          name: 'SDXL',
          capability: 'image_generate',
          cost: 50,
          isActive: true,
          settings: {},
        },
      ]),
    } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue(STYLES) } as any,
  );

describe('MediaAISettingsService default style', () => {
  it('serves the configured default style first and reports its id', async () => {
    const service = createService('12');

    const response = await service.getPromptImageAISettings();

    expect(response.styles.map((s) => s.id)).toEqual([12, 10, 11, 13]);
    expect(response.defaultSettings.defaultStyleId).toBe(12);
  });

  it('keeps id order when no default is configured', async () => {
    const service = createService(null);

    const response = await service.getPromptImageAISettings();

    expect(response.styles.map((s) => s.id)).toEqual([10, 11, 12, 13]);
    expect(response.defaultSettings.defaultStyleId).toBe(10);
  });

  it('ignores a configured id that no longer exists', async () => {
    const service = createService('999');

    const response = await service.getPromptImageAISettings();

    expect(response.styles.map((s) => s.id)).toEqual([10, 11, 12, 13]);
  });
});
