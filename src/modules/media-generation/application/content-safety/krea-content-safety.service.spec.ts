import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { KreaContentSafetyService } from './krea-content-safety.service';

jest.mock('axios');

describe('KreaContentSafetyService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = (
    values: Record<string, string | null> = {
      OPENAI_API_KEY: 'moderation-key',
      OPENAI_MODERATION_MODEL: 'omni-moderation-latest',
    },
  ) => {
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => values[key] ?? null),
    } as unknown as ProviderRuntimeConfigService;

    return {
      service: new KreaContentSafetyService(providerRuntimeConfigService),
      providerRuntimeConfigService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a Krea prompt only after OpenAI returns an unflagged result', async () => {
    const { service } = createService();
    mockedAxios.post.mockResolvedValueOnce({
      data: { results: [{ flagged: false }] },
    });

    await expect(
      service.assertPromptAllowed('krea2_turbo', 'a friendly forest mascot'),
    ).resolves.toBeUndefined();

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/moderations',
      {
        model: 'omni-moderation-latest',
        input: 'a friendly forest mascot',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer moderation-key',
        }),
        timeout: 15_000,
      }),
    );
  });

  it('rejects a flagged Krea provider image without exposing its signed URL', async () => {
    const { service } = createService();
    const signedUrl =
      'https://private.example/generated.png?signature=super-secret';
    mockedAxios.post.mockResolvedValueOnce({
      data: { results: [{ flagged: true }] },
    });

    let caught: unknown;
    try {
      await service.assertProviderImagesAllowed('krea2_lora_generation', [
        signedUrl,
      ]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as Error).message).toContain('content safety policy');
    expect((caught as Error).message).not.toContain(signedUrl);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/moderations',
      expect.objectContaining({
        input: [
          {
            type: 'image_url',
            image_url: { url: signedUrl },
          },
        ],
      }),
      expect.any(Object),
    );
  });

  it('fails closed with a generic message when moderation fails', async () => {
    const { service } = createService();
    mockedAxios.post.mockRejectedValueOnce(
      new Error(
        'upstream failed for https://private.example/image.png?token=secret',
      ),
    );

    let caught: unknown;
    try {
      await service.assertPromptAllowed(
        'krea2_turbo',
        'private prompt text',
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as Error).message).toBe(
      'Content safety validation is temporarily unavailable.',
    );
    expect((caught as Error).message).not.toContain('private prompt text');
    expect((caught as Error).message).not.toContain('private.example');
  });

  it('leaves non-Krea models unchanged without reading config or calling OpenAI', async () => {
    const { service, providerRuntimeConfigService } = createService();

    await expect(
      service.assertPromptAllowed('z_image_turbo', 'unchanged path'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertProviderImagesAllowed('flux2_klein', [
        'https://provider.test/image.png',
      ]),
    ).resolves.toBeUndefined();

    expect(providerRuntimeConfigService.getString).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
