import { HttpException } from '@nestjs/common';
import { UploadController } from './upload.controller';

const file = (name: string): Express.Multer.File =>
  ({
    buffer: Buffer.from(name),
    mimetype: 'image/jpeg',
    originalname: `${name}.jpg`,
  }) as Express.Multer.File;

describe('UploadController.uploadImages', () => {
  const buildController = (
    upload: (buffer: Buffer, mimetype: string) => Promise<string>,
  ) => {
    const uploadService = { uploadByBuffer: jest.fn(upload) };
    return {
      controller: new UploadController(uploadService as any),
      uploadService,
    };
  };

  it('returns one URL per file, in the order they were sent', async () => {
    const { controller, uploadService } = buildController(async (buffer) => {
      // Resolve out of order so a naive implementation would scramble results.
      const name = buffer.toString();
      await new Promise((resolve) =>
        setTimeout(resolve, name === 'a' ? 5 : 0),
      );
      return `https://cdn.test/${name}.jpg`;
    });

    const result = await controller.uploadImages([
      file('a'),
      file('b'),
      file('c'),
    ]);

    expect(result.imageUrls).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
      'https://cdn.test/c.jpg',
    ]);
    expect(uploadService.uploadByBuffer).toHaveBeenCalledTimes(3);
  });

  it('keeps ordering across concurrency batches', async () => {
    const { controller } = buildController(
      async (buffer) => `https://cdn.test/${buffer.toString()}.jpg`,
    );

    const names = ['1', '2', '3', '4', '5', '6', '7'];
    const result = await controller.uploadImages(names.map(file));

    expect(result.imageUrls).toEqual(
      names.map((name) => `https://cdn.test/${name}.jpg`),
    );
  });

  it('rejects an empty request', async () => {
    const { controller } = buildController(async () => 'unused');

    await expect(controller.uploadImages([])).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(
      controller.uploadImages(undefined as unknown as Express.Multer.File[]),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects more files than the batch limit', async () => {
    const { controller, uploadService } = buildController(
      async () => 'https://cdn.test/x.jpg',
    );

    await expect(
      controller.uploadImages(
        Array.from({ length: 11 }, (_, index) => file(String(index))),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(uploadService.uploadByBuffer).not.toHaveBeenCalled();
  });

  it('fails the whole request when one file fails, so a returned array is always complete', async () => {
    const { controller } = buildController(async (buffer) => {
      if (buffer.toString() === 'b') {
        throw new Error('spaces down');
      }
      return `https://cdn.test/${buffer.toString()}.jpg`;
    });

    await expect(
      controller.uploadImages([file('a'), file('b')]),
    ).rejects.toThrow(/Failed to upload images/);
  });
});
