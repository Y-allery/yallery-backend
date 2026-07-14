import { ConfigService } from '@nestjs/config';
import { SpacesStorageService } from './spaces-storage.service';

const createService = () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        SPACES_REGION: 'fra1',
        SPACES_BUCKET: 'bucket',
        SPACES_ACCESS_KEY: 'ak',
        SPACES_SECRET_KEY: 'sk',
        MEDIA_PROXY_PUBLIC_BASE_URL: 'https://api.test',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const service = new SpacesStorageService(configService);
  const putObject = jest
    .spyOn(service as unknown as { putObject: () => Promise<void> }, 'putObject')
    .mockResolvedValue(undefined);
  return { service, putObject };
};

describe('SpacesStorageService.uploadVideoBuffer', () => {
  it('stores known video mime types under octoai_videos and returns a proxy URL', async () => {
    const { service, putObject } = createService();

    const url = await service.uploadVideoBuffer(
      Buffer.from('v'),
      'video/quicktime',
      'clip.mov',
    );

    expect(putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^octoai_videos\/[0-9a-f-]+\.mov$/),
      expect.any(Buffer),
      'video/quicktime',
    );
    expect(url).toMatch(
      /^https:\/\/api\.test\/media\/video\/upload\/octoai_videos\/[0-9a-f-]+\.mov$/,
    );
  });

  it('derives extension and content type from the filename for octet-stream uploads', async () => {
    const { service, putObject } = createService();

    await service.uploadVideoBuffer(
      Buffer.from('v'),
      'application/octet-stream',
      'clip.MOV',
    );

    expect(putObject).toHaveBeenCalledWith(
      expect.stringMatching(/\.mov$/),
      expect.any(Buffer),
      'video/quicktime',
    );
  });

  it('falls back to mp4 when neither mime type nor filename identify the container', async () => {
    const { service, putObject } = createService();

    await service.uploadVideoBuffer(Buffer.from('v'), 'application/octet-stream');

    expect(putObject).toHaveBeenCalledWith(
      expect.stringMatching(/\.mp4$/),
      expect.any(Buffer),
      'video/mp4',
    );
  });
});
