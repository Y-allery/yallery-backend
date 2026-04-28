import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UploadService } from 'src/upload/upload.service';
import { RunpodOpenEndpointMediaProvider } from './runpod-open-endpoint-media.provider';

jest.mock('axios');

describe('RunpodOpenEndpointMediaProvider audio generation', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createProvider = () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          RUNPOD_API_KEY: 'test-runpod-key',
          RUNPOD_MMAUDIO_ENDPOINT_ID: 'test-mmaudio-endpoint',
          RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT: '0',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const uploadService = {
      uploadVideoByUrl: jest.fn(async () => 'https://cdn.test/mmaudio.mp4'),
    } as unknown as UploadService;

    return {
      provider: new RunpodOpenEndpointMediaProvider(
        configService,
        uploadService,
      ),
      uploadService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads RunPod base64 MP4 output through Cloudinary', async () => {
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
    expect(uploadService.uploadVideoByUrl).toHaveBeenCalledWith(
      'data:video/mp4;base64,AAAA',
    );
    expect(result.videoUrl).toBe('https://cdn.test/mmaudio.mp4');
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
