import { HttpException, HttpStatus } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

const createFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    buffer: Buffer.from('bytes'),
    mimetype: 'video/mp4',
    originalname: 'clip.mp4',
    ...overrides,
  } as Express.Multer.File);

describe('UploadController.uploadVideo', () => {
  const createController = () => {
    const uploadService = {
      uploadVideoByBuffer: jest.fn(
        async () => 'https://api.test/media/video/upload/octoai_videos/x.mp4',
      ),
      uploadByBuffer: jest.fn(),
    } as unknown as jest.Mocked<UploadService>;
    return { controller: new UploadController(uploadService), uploadService };
  };

  it('uploads a video and returns the proxy URL', async () => {
    const { controller, uploadService } = createController();
    const file = createFile();

    await expect(controller.uploadVideo(file)).resolves.toEqual({
      videoUrl: 'https://api.test/media/video/upload/octoai_videos/x.mp4',
    });
    expect(uploadService.uploadVideoByBuffer).toHaveBeenCalledWith(
      file.buffer,
      'video/mp4',
      'clip.mp4',
    );
  });

  it('accepts octet-stream uploads with a video filename', async () => {
    const { controller } = createController();

    await expect(
      controller.uploadVideo(
        createFile({ mimetype: 'application/octet-stream', originalname: 'clip.MOV' }),
      ),
    ).resolves.toHaveProperty('videoUrl');
  });

  it('rejects a missing file with 400', async () => {
    const { controller } = createController();

    await expect(
      controller.uploadVideo(undefined as unknown as Express.Multer.File),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('rejects non-video files with 400', async () => {
    const { controller, uploadService } = createController();

    await expect(
      controller.uploadVideo(
        createFile({ mimetype: 'image/png', originalname: 'image.png' }),
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(uploadService.uploadVideoByBuffer).not.toHaveBeenCalled();
  });

  it('maps storage errors to 500 with the reason', async () => {
    const { controller, uploadService } = createController();
    uploadService.uploadVideoByBuffer.mockRejectedValue(
      new Error('Spaces storage is not configured'),
    );

    await expect(controller.uploadVideo(createFile())).rejects.toEqual(
      new HttpException(
        'Failed to upload video: Spaces storage is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
    );
  });
});
