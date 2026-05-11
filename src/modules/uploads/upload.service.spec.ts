import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UploadService } from './upload.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
    },
    utils: {
      api_sign_request: jest.fn(),
    },
  },
}));

describe('UploadService video assets', () => {
  const mockedUpload = cloudinary.uploader.upload as jest.Mock;

  const createService = () =>
    new UploadService({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          CLOUDINARY_CLOUD_NAME: 'test-cloud',
          CLOUDINARY_API_KEY: 'test-key',
          CLOUDINARY_API_SECRET: 'test-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads video and returns eager preview URL', async () => {
    mockedUpload.mockImplementation((_url, _options, callback) => {
      callback(null, {
        secure_url: 'https://cdn.test/video.mp4',
        public_id: 'octoai_videos/video',
        width: 1920,
        height: 1080,
        audio_codec: 'aac',
        eager: [{ secure_url: 'https://cdn.test/video-preview.jpg' }],
      });
    });

    const result = await createService().uploadVideoAssetByUrl(
      'data:video/mp4;base64,AAAA',
    );

    expect(mockedUpload).toHaveBeenCalledWith(
      'data:video/mp4;base64,AAAA',
      expect.objectContaining({
        resource_type: 'video',
        folder: 'octoai_videos',
        eager_async: false,
        eager: [
          expect.objectContaining({
            start_offset: '0',
            format: 'jpg',
          }),
        ],
      }),
      expect.any(Function),
    );
    expect(result).toEqual({
      videoUrl: 'https://cdn.test/video.mp4',
      previewImageUrl: 'https://cdn.test/video-preview.jpg',
      width: 1920,
      height: 1080,
      hasAudio: true,
    });
  });

  it('keeps upload successful when eager preview is missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedUpload.mockImplementation((_url, _options, callback) => {
      callback(null, {
        secure_url: 'https://cdn.test/video.mp4',
        public_id: 'octoai_videos/video',
      });
    });

    await expect(
      createService().uploadVideoAssetByUrl('https://cdn.test/input.mp4'),
    ).resolves.toEqual({
      videoUrl: 'https://cdn.test/video.mp4',
      previewImageUrl: null,
      width: null,
      height: null,
      hasAudio: null,
    });

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
