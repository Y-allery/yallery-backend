import { SpacesStorageService } from './spaces-storage.service';
import { UploadService } from './upload.service';

const createSpacesStorageMock = (configured: boolean) =>
  ({
    isConfigured: jest.fn(() => configured),
    uploadBuffer: jest.fn(async () => 'https://cdn.spaces/buffer.jpg'),
    uploadVideoBuffer: jest.fn(
      async () => 'https://cdn.spaces/media/video/upload/octoai_videos/x.mp4',
    ),
    uploadImageFromSource: jest.fn(async () => 'https://cdn.spaces/image.jpg'),
    uploadVideoAssetFromSource: jest.fn(async () => ({
      videoUrl: 'https://cdn.spaces/video.mp4',
      previewImageUrl: 'https://cdn.spaces/video_preview.jpg',
      width: 720,
      height: 1280,
      hasAudio: true,
    })),
  } as unknown as jest.Mocked<SpacesStorageService>);

const createService = (spacesConfigured: boolean) => {
  const spacesStorage = createSpacesStorageMock(spacesConfigured);
  return { service: new UploadService(spacesStorage), spacesStorage };
};

describe('UploadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when Spaces is configured', () => {
    it('uploads images by url to Spaces', async () => {
      const { service, spacesStorage } = createService(true);

      await expect(service.uploadByUrl('https://runpod/out.png')).resolves.toBe(
        'https://cdn.spaces/image.jpg',
      );
      expect(spacesStorage.uploadImageFromSource).toHaveBeenCalledWith(
        'https://runpod/out.png',
      );
    });

    it('uploads video assets by url to Spaces', async () => {
      const { service, spacesStorage } = createService(true);

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
    });

    it('uploads image buffers to Spaces', async () => {
      const { service, spacesStorage } = createService(true);

      const buffer = Buffer.from('img');
      await expect(service.uploadByBuffer(buffer, 'image/png')).resolves.toBe(
        'https://cdn.spaces/buffer.jpg',
      );
      expect(spacesStorage.uploadBuffer).toHaveBeenCalledWith(
        buffer,
        'image/png',
      );
    });

    it('uploads admin video buffers to Spaces', async () => {
      const { service, spacesStorage } = createService(true);

      const buffer = Buffer.from('vid');
      await expect(
        service.uploadVideoByBuffer(buffer, 'video/mp4', 'clip.mp4'),
      ).resolves.toBe('https://cdn.spaces/media/video/upload/octoai_videos/x.mp4');
      expect(spacesStorage.uploadVideoBuffer).toHaveBeenCalledWith(
        buffer,
        'video/mp4',
        'clip.mp4',
      );
    });
  });

  describe('when Spaces is not configured', () => {
    it.each([
      [
        'uploadByUrl',
        (service: UploadService) => service.uploadByUrl('https://runpod/out.png'),
      ],
      [
        'uploadVideoAssetByUrl',
        (service: UploadService) =>
          service.uploadVideoAssetByUrl('https://runpod/out.mp4'),
      ],
      [
        'uploadByBuffer',
        (service: UploadService) =>
          service.uploadByBuffer(Buffer.from('img'), 'image/png'),
      ],
      [
        'uploadVideoByBuffer',
        (service: UploadService) =>
          service.uploadVideoByBuffer(Buffer.from('vid'), 'video/mp4'),
      ],
    ])('%s fails loudly instead of silently falling back', async (_name, call) => {
      const { service } = createService(false);

      await expect(call(service)).rejects.toThrow(
        'Spaces storage is not configured',
      );
    });
  });
});
