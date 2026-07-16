import { NotFoundException } from '@nestjs/common';
import * as sharp from 'sharp';
import { SpacesStorageService } from 'src/modules/uploads/spaces-storage.service';
import { MediaProxyService } from './media-proxy.service';

const createSpacesMock = (objects: Map<string, Buffer>) =>
  ({
    cdnUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
    objectExists: jest.fn(async (key: string) => objects.has(key)),
    getObjectBuffer: jest.fn(async (key: string) => {
      const body = objects.get(key);
      if (!body) throw new Error(`missing object ${key}`);
      return body;
    }),
    putPublicObject: jest.fn(async (key: string, body: Buffer) => {
      objects.set(key, body);
    }),
  }) as unknown as jest.Mocked<SpacesStorageService>;

const testJpeg = (width: number, height: number): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();

describe('MediaProxyService', () => {
  let objects: Map<string, Buffer>;
  let spaces: jest.Mocked<SpacesStorageService>;
  let service: MediaProxyService;

  beforeEach(() => {
    objects = new Map();
    spaces = createSpacesMock(objects);
    service = new MediaProxyService(spaces);
  });

  it('redirects originals straight to the CDN', async () => {
    const resolved = await service.resolve('image', 'octoai_images/a.png');
    expect(resolved.redirectUrl).toBe('https://cdn.test/octoai_images/a.png');
    expect(resolved.cacheable).toBe(true);
    expect(spaces.objectExists).not.toHaveBeenCalled();
  });

  it('rejects unresolvable paths', async () => {
    await expect(service.resolve('image', '../../etc/passwd')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generates an image variant once and serves it from the CDN', async () => {
    objects.set('octoai_images/a.jpg', await testJpeg(1200, 900));

    const first = await service.resolve(
      'image',
      't_yallery_thumb_image_v2/octoai_images/a.jpg',
    );
    const derivedKey = 't/t_yallery_thumb_image_v2/octoai_images/a.jpg';
    expect(first.redirectUrl).toBe(`https://cdn.test/${derivedKey}`);
    expect(first.cacheable).toBe(true);
    expect(spaces.putPublicObject).toHaveBeenCalledTimes(1);

    const derived = objects.get(derivedKey)!;
    const metadata = await sharp(derived).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(400);

    // Second request is answered from the in-memory known-derived cache.
    const second = await service.resolve(
      'image',
      't_yallery_thumb_image_v2/octoai_images/a.jpg',
    );
    expect(second.redirectUrl).toBe(`https://cdn.test/${derivedKey}`);
    expect(spaces.putPublicObject).toHaveBeenCalledTimes(1);
    expect(spaces.getObjectBuffer).toHaveBeenCalledTimes(1);
  });

  it('limits (not enlarges) inside-fit variants', async () => {
    objects.set('octoai_images/small.jpg', await testJpeg(300, 200));

    await service.resolve(
      'image',
      't_yallery_preview_image_v2/octoai_images/small.jpg',
    );
    const derived = objects.get(
      't/t_yallery_preview_image_v2/octoai_images/small.jpg',
    )!;
    const metadata = await sharp(derived).metadata();
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(200);
  });

  it('redirects image transforms aimed at video objects to the original', async () => {
    const resolved = await service.resolve(
      'video',
      't_yallery_thumb_image_v2/octoai_videos/x.mp4',
    );
    expect(resolved.redirectUrl).toBe('https://cdn.test/octoai_videos/x.mp4');
    expect(spaces.putPublicObject).not.toHaveBeenCalled();
  });

  it('falls back to the original when generation fails, uncacheable', async () => {
    // No source object stored -> getObjectBuffer throws.
    const resolved = await service.resolve(
      'image',
      't_yallery_thumb_image_v2/octoai_images/missing.jpg',
    );
    expect(resolved.redirectUrl).toBe(
      'https://cdn.test/octoai_images/missing.jpg',
    );
    expect(resolved.cacheable).toBe(false);
  });

  it('streams watermarked downloads as attachments', async () => {
    objects.set('octoai_images/art.jpg', await testJpeg(2000, 1500));

    const resolved = await service.resolve(
      'image',
      't_yallery_download_watermarked_v1/octoai_images/art.jpg',
    );
    expect(resolved.redirectUrl).toBeNull();
    expect(resolved.contentType).toBe('image/jpeg');
    expect(resolved.attachmentFilename).toBe('art.jpg');
    const metadata = await sharp(resolved.body!).metadata();
    expect(metadata.width).toBe(1600);
  });

  it('streams video downloads with original bytes', async () => {
    const bytes = Buffer.from('fake-video-bytes');
    objects.set('octoai_videos/x.mp4', bytes);

    const resolved = await service.resolve(
      'video',
      't_yallery_video_download_v1/octoai_videos/x.mp4',
    );
    expect(resolved.redirectUrl).toBeNull();
    expect(resolved.body).toEqual(bytes);
    expect(resolved.contentType).toBe('video/mp4');
    expect(resolved.attachmentFilename).toBe('x.mp4');
  });

  it('serves already-generated legacy posters without regenerating', async () => {
    objects.set('t/poster/octoai_videos/xyz.jpg', await testJpeg(720, 405));

    const resolved = await service.resolve(
      'video',
      'so_0/octoai_videos/xyz.jpg',
    );
    expect(resolved.redirectUrl).toBe(
      'https://cdn.test/t/poster/octoai_videos/xyz.jpg',
    );
  });
});
