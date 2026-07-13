import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { SpacesStorageService } from './spaces-storage.service';
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

const createSpacesStorageMock = (configured: boolean) =>
  ({
    isConfigured: jest.fn(() => configured),
    uploadBuffer: jest.fn(async () => 'https://cdn.spaces/buffer.jpg'),
    uploadImageFromSource: jest.fn(async () => 'https://cdn.spaces/image.jpg'),
    uploadVideoAssetFromSource: jest.fn(async () => ({
      videoUrl: 'https://cdn.spaces/video.mp4',
      previewImageUrl: 'https://cdn.spaces/video_preview.jpg',
      width: 720,
      height: 1280,
      hasAudio: true,
    })),
  } as unknown as jest.Mocked<SpacesStorageService>);

describe('UploadService video assets', () => {
  const mockedUpload = cloudinary.uploader.upload as jest.Mock;

  const createService = () =>
    new UploadService(
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            CLOUDINARY_CLOUD_NAME: 'test-cloud',
            CLOUDINARY_API_KEY: 'test-key',
            CLOUDINARY_API_SECRET: 'test-secret',
          };
          return values[key];
        }),
      } as unknown as ConfigService,
      createSpacesStorageMock(false),
    );

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

describe('UploadService storage driver routing', () => {
  const mockedUpload = cloudinary.uploader.upload as jest.Mock;

  const createService = ({
    driver,
    spacesConfigured,
  }: {
    driver?: string;
    spacesConfigured: boolean;
  }) => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          MEDIA_STORAGE_DRIVER: driver,
          CLOUDINARY_CLOUD_NAME: 'test-cloud',
          CLOUDINARY_API_KEY: 'test-key',
          CLOUDINARY_API_SECRET: 'test-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const spacesStorage = createSpacesStorageMock(spacesConfigured);

    return { service: new UploadService(configService, spacesStorage), spacesStorage };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes uploadByUrl to Spaces when driver=spaces and configured', async () => {
    const { service, spacesStorage } = createService({
      driver: 'spaces',
      spacesConfigured: true,
    });

    await expect(service.uploadByUrl('https://runpod/out.png')).resolves.toBe(
      'https://cdn.spaces/image.jpg',
    );
    expect(spacesStorage.uploadImageFromSource).toHaveBeenCalledWith(
      'https://runpod/out.png',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('routes uploadVideoAssetByUrl to Spaces when driver=spaces and configured', async () => {
    const { service, spacesStorage } = createService({
      driver: 'spaces',
      spacesConfigured: true,
    });

    await expect(
      service.uploadVideoAssetByUrl('https://runpod/out.mp4'),
    ).resolves.toEqual(
      expect.objectContaining({
        videoUrl: 'https://cdn.spaces/video.mp4',
        previewImageUrl: 'https://cdn.spaces/video_preview.jpg',
      }),
    );
    expect(spacesStorage.uploadVideoAssetFromSource).toHaveBeenCalledWith(
      'https://runpod/out.mp4',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('routes uploadByBuffer to Spaces when driver=spaces and configured', async () => {
    const { service, spacesStorage } = createService({
      driver: 'spaces',
      spacesConfigured: true,
    });

    const buffer = Buffer.from('img');
    await expect(service.uploadByBuffer(buffer, 'image/png')).resolves.toBe(
      'https://cdn.spaces/buffer.jpg',
    );
    expect(spacesStorage.uploadBuffer).toHaveBeenCalledWith(buffer, 'image/png');
  });

  it('falls back to Cloudinary when driver=spaces but Spaces env is missing', async () => {
    mockedUpload.mockImplementation((_url, _options, callback) => {
      callback(null, { secure_url: 'https://res.cloudinary.com/mock.jpg' });
    });
    const { service, spacesStorage } = createService({
      driver: 'spaces',
      spacesConfigured: false,
    });

    await expect(service.uploadByUrl('https://runpod/out.png')).resolves.toBe(
      'https://res.cloudinary.com/mock.jpg',
    );
    expect(spacesStorage.uploadImageFromSource).not.toHaveBeenCalled();
  });

  it('stays on Cloudinary when driver is unset', async () => {
    mockedUpload.mockImplementation((_url, _options, callback) => {
      callback(null, { secure_url: 'https://res.cloudinary.com/mock.jpg' });
    });
    const { service, spacesStorage } = createService({
      driver: undefined,
      spacesConfigured: true,
    });

    await expect(service.uploadByUrl('https://runpod/out.png')).resolves.toBe(
      'https://res.cloudinary.com/mock.jpg',
    );
    expect(spacesStorage.uploadImageFromSource).not.toHaveBeenCalled();
  });
});
