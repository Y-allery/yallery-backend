import { BadGatewayException } from '@nestjs/common';
import axios from 'axios';
import * as sharp from 'sharp';
import { UploadService } from 'src/modules/uploads/upload.service';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodEndpointResolver } from './runpod-endpoint.resolver';
import { RunpodMediaClient } from './runpod-media.client';
import { RunpodOutputExtractor } from './runpod-output.extractor';
import { RunpodOpenEndpointMediaProvider } from './runpod-open-endpoint-media.provider';
import { RunpodPayloadBuilder } from './runpod-payload.builder';
import { RunpodTimeoutPolicyService } from './runpod-timeout-policy.service';

jest.mock('axios');

describe('RunpodOpenEndpointMediaProvider audio generation', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createProvider = () => {
    const values: Record<string, string> = {
      RUNPOD_API_KEY: 'test-runpod-key',
      RUNPOD_VIDEO_API_KEY: 'test-runpod-video-key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'test-mmaudio-endpoint',
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'test-p-video-endpoint',
      RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID: 'test-wan-endpoint',
      RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID: 'test-qwen-endpoint',
      RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT: '0',
      RUNPOD_POLL_INTERVAL_MS: '0',
    };
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => values[key] ?? null),
      getNumber: jest.fn(async (key: string) =>
        values[key] !== undefined ? Number(values[key]) : undefined,
      ),
    } as unknown as ProviderRuntimeConfigService;

    const uploadService = {
      uploadByUrl: jest.fn(async () => 'https://cdn.test/edited.png'),
      uploadVideoAssetByUrl: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/generated.mp4',
        previewImageUrl: 'https://cdn.test/generated-preview.jpg',
        width: 1920,
        height: 1080,
        hasAudio: true,
      })),
    } as unknown as UploadService;

    return {
      provider: new RunpodOpenEndpointMediaProvider(
        new RunpodMediaClient(providerRuntimeConfigService),
        new RunpodEndpointResolver(providerRuntimeConfigService),
        new RunpodOutputExtractor(),
        new RunpodPayloadBuilder(),
        new RunpodTimeoutPolicyService(providerRuntimeConfigService),
        uploadService,
      ),
      uploadService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads RunPod base64 MP4 output through the upload service', async () => {
    const { provider, uploadService } = createProvider();

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: {
          videos: [
            {
              base64: 'AAAA',
              mime_type: 'video/mp4',
            },
          ],
        },
      },
    });

    const result = await provider.generateAudio({
      aiService: 'mmaudio_v2',
      prompt: 'upbeat meme soundtrack',
      videoUrl: 'https://cdn.test/source.mp4',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/test-mmaudio-endpoint/run',
      {
        input: {
          video_url: 'https://cdn.test/source.mp4',
          prompt: 'upbeat meme soundtrack',
          negative_prompt: '',
          match_source_duration: true,
          return_base64: true,
          num_steps: 25,
          cfg_strength: 4.5,
        },
      },
      expect.any(Object),
    );
    expect(uploadService.uploadVideoAssetByUrl).toHaveBeenCalledWith(
      'data:video/mp4;base64,AAAA',
    );
    expect(result).toMatchObject({
      videoUrl: 'https://cdn.test/generated.mp4',
      previewImageUrl: 'https://cdn.test/generated-preview.jpg',
      width: 1920,
      height: 1080,
      hasAudio: true,
    });
  });

  it('returns uploaded preview image URL for text video output', async () => {
    const { provider, uploadService } = createProvider();

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: {
          videos: [{ base64: 'BBBB', mime_type: 'video/mp4' }],
        },
      },
    });

    const result = await provider.generateTextVideos({
      aiService: 'p_video_text',
      prompt: 'a cinematic robot',
      orientation: 'horizontal',
      duration: 5,
    });

    expect(uploadService.uploadVideoAssetByUrl).toHaveBeenCalledWith(
      'data:video/mp4;base64,BBBB',
    );
    expect(result.previewImageUrl).toBe(
      'https://cdn.test/generated-preview.jpg',
    );
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.hasAudio).toBe(true);
  });

  it('uses video preset dimensions when upload metadata is missing for text video', async () => {
    const { provider, uploadService } = createProvider();
    (uploadService.uploadVideoAssetByUrl as jest.Mock).mockResolvedValueOnce({
      videoUrl: 'https://cdn.test/generated.mp4',
      previewImageUrl: 'https://cdn.test/generated-preview.jpg',
      width: null,
      height: null,
      hasAudio: null,
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: {
          videos: [{ base64: 'BBBB', mime_type: 'video/mp4' }],
        },
      },
    });

    const result = await provider.generateTextVideos({
      aiService: 'p_video_text',
      prompt: 'a cinematic robot',
      orientation: 'horizontal',
      duration: 5,
    });

    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.hasAudio).toBeNull();
  });

  it('derives portrait video orientation from the source image, ignoring the request orientation', async () => {
    const { provider, uploadService } = createProvider();
    // A real portrait image (height > width); the request says horizontal but the image wins.
    const portrait = await sharp({
      create: {
        width: 64,
        height: 128,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();

    mockedAxios.get.mockResolvedValueOnce({ data: portrait });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: { videos: [{ base64: 'CCCC', mime_type: 'video/mp4' }] },
      },
    });

    const result = await provider.generateImageVideos({
      aiService: 'p_video_image',
      prompt: 'animate this',
      imageUrl: 'https://cdn.test/source.png',
      orientation: 'horizontal',
      duration: 5,
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://cdn.test/source.png',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/test-p-video-endpoint/run',
      {
        input: expect.objectContaining({
          image_b64: expect.any(String),
          width: 704,
          height: 1280,
          frames: 121,
        }),
      },
      expect.any(Object),
    );
    expect(uploadService.uploadVideoAssetByUrl).toHaveBeenCalledWith(
      'data:video/mp4;base64,CCCC',
    );
    expect(result.previewImageUrl).toBe(
      'https://cdn.test/generated-preview.jpg',
    );
    expect(result.hasAudio).toBe(true);
  });

  it('derives landscape video orientation from a landscape source image', async () => {
    const { provider } = createProvider();
    const landscape = await sharp({
      create: {
        width: 128,
        height: 64,
        channels: 3,
        background: { r: 30, g: 20, b: 10 },
      },
    })
      .png()
      .toBuffer();

    mockedAxios.get.mockResolvedValueOnce({ data: landscape });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-2',
        status: 'COMPLETED',
        output: { videos: [{ base64: 'DDDD', mime_type: 'video/mp4' }] },
      },
    });

    await provider.generateImageVideos({
      aiService: 'p_video_image',
      prompt: 'animate this',
      imageUrl: 'https://cdn.test/wide.png',
      orientation: 'vertical',
      duration: 5,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/test-p-video-endpoint/run',
      {
        input: expect.objectContaining({ width: 1280, height: 704 }),
      },
      expect.any(Object),
    );
  });

  it('returns uploaded preview image URL for meme output', async () => {
    const { provider, uploadService } = createProvider();

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: {
          videos: [{ base64: 'DDDD', mime_type: 'video/mp4' }],
        },
      },
    });

    const result = await provider.generateMemes({
      aiService: 'wan22_animate_native',
      memeId: 1,
      imageUrl: 'https://cdn.test/source.png',
      videoUrl: 'https://cdn.test/reference.mp4',
    });

    expect(uploadService.uploadVideoAssetByUrl).toHaveBeenCalledWith(
      'data:video/mp4;base64,DDDD',
    );
    expect(result.previewImageUrl).toBe(
      'https://cdn.test/generated-preview.jpg',
    );
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.hasAudio).toBe(true);
  });

  it('submits image edits through async /run (not /runsync) and polls through a cold start', async () => {
    const { provider, uploadService } = createProvider();

    // Cold start: submit returns IN_QUEUE with no output, then a status poll returns the image.
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'edit-job-1', status: 'IN_QUEUE' },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 'edit-job-1',
        status: 'COMPLETED',
        output: { images: [{ url: 'https://runpod.test/edited.png' }] },
      },
    });

    const result = await provider.editImages({
      aiService: 'qwen_image_edit_baked',
      prompt: 'make it snow',
      imageUrl: 'https://cdn.test/source.png',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/test-qwen-endpoint/run',
      { input: expect.objectContaining({ image_url: 'https://cdn.test/source.png' }) },
      expect.any(Object),
    );
    // Must have polled /status rather than trusting the first non-terminal response.
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/test-qwen-endpoint/status/edit-job-1',
      expect.any(Object),
    );
    expect(uploadService.uploadByUrl).toHaveBeenCalledWith(
      'https://runpod.test/edited.png',
    );
    expect(result.imageUrls).toEqual(['https://cdn.test/edited.png']);
  });

  it('fails cleanly when an image edit completes without image output', async () => {
    const { provider } = createProvider();

    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'edit-job-2', status: 'COMPLETED', output: {} },
    });

    await expect(
      provider.editImages({
        aiService: 'qwen_image_edit_baked',
        prompt: 'make it snow',
        imageUrl: 'https://cdn.test/source.png',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails cleanly when RunPod completes without video output', async () => {
    const { provider } = createProvider();

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'COMPLETED',
        output: {},
      },
    });

    await expect(
      provider.generateAudio({
        aiService: 'mmaudio_v2',
        prompt: 'upbeat meme soundtrack',
        videoUrl: 'https://cdn.test/source.mp4',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
