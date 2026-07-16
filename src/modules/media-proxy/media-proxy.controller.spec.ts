import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import * as sharp from 'sharp';
import { Readable } from 'stream';
import {
  ObjectTooLargeError,
  SpacesStorageService,
} from 'src/modules/uploads/spaces-storage.service';
import { MediaProxyController } from './media-proxy.controller';
import { MediaProxyService } from './media-proxy.service';

describe('MediaProxyController (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let objects: Map<string, Buffer>;

  const http = axios.create({
    maxRedirects: 0,
    validateStatus: () => true,
  });

  beforeAll(async () => {
    objects = new Map();
    const spacesMock = {
      cdnUrl: (key: string) => `https://cdn.test/${key}`,
      objectExists: async (key: string) => objects.has(key),
      getObjectBuffer: async (key: string) => {
        if (key.includes('toolarge')) {
          throw new ObjectTooLargeError(key, 1024);
        }
        const body = objects.get(key);
        if (!body) throw new Error(`missing object ${key}`);
        return body;
      },
      getObjectStream: async (key: string) => {
        const body = objects.get(key);
        if (!body) throw new Error(`missing object ${key}`);
        return {
          stream: Readable.from(body),
          contentLength: body.length,
          contentType: null,
        };
      },
      putPublicObject: async (key: string, body: Buffer) => {
        objects.set(key, body);
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MediaProxyController],
      providers: [
        MediaProxyService,
        { provide: SpacesStorageService, useValue: spacesMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('301-redirects originals to the CDN with immutable cache headers', async () => {
    const res = await http.get(
      `${baseUrl}/media/image/upload/octoai_images/a.png`,
    );
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://cdn.test/octoai_images/a.png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('301-redirects generated variants to their derived CDN key', async () => {
    objects.set(
      'octoai_images/b.jpg',
      await sharp({
        create: {
          width: 900,
          height: 900,
          channels: 3,
          background: { r: 10, g: 120, b: 200 },
        },
      })
        .jpeg()
        .toBuffer(),
    );

    const res = await http.get(
      `${baseUrl}/media/image/upload/t_yallery_thumb_image_v2/octoai_images/b.jpg`,
    );
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(
      'https://cdn.test/t/t_yallery_thumb_image_v2/octoai_images/b.jpg',
    );
    expect(res.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(objects.has('t/t_yallery_thumb_image_v2/octoai_images/b.jpg')).toBe(
      true,
    );
  });

  it('302-redirects failed generations to the original without caching', async () => {
    // Source object missing -> variant generation fails -> fallback.
    const res = await http.get(
      `${baseUrl}/media/image/upload/t_yallery_thumb_image_v2/octoai_images/missing.jpg`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      'https://cdn.test/octoai_images/missing.jpg',
    );
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('streams download variants with Content-Disposition', async () => {
    objects.set('octoai_videos/x.mp4', Buffer.from('fake-video'));

    const res = await http.get(
      `${baseUrl}/media/video/upload/t_yallery_video_download_v1/octoai_videos/x.mp4`,
      { responseType: 'arraybuffer' },
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="x.mp4"',
    );
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['content-length']).toBe('10');
    expect(Buffer.from(res.data)).toEqual(Buffer.from('fake-video'));
  });

  it('413s when a source object exceeds the download byte cap', async () => {
    // Legacy poster regeneration downloads the source video into memory —
    // the storage layer refuses oversized objects with ObjectTooLargeError.
    objects.set('octoai_videos/toolarge.mp4', Buffer.from('v'));

    const res = await http.get(
      `${baseUrl}/media/video/upload/so_0/octoai_videos/toolarge.jpg`,
    );
    expect(res.status).toBe(413);
  });

  it('404s unsafe or unknown paths', async () => {
    const traversal = await http.get(
      `${baseUrl}/media/image/upload/%2e%2e/secrets.txt`,
    );
    expect(traversal.status).toBe(404);

    const unknownTransform = await http.get(
      `${baseUrl}/media/image/upload/t_not_registered/octoai_images/a.png`,
    );
    expect(unknownTransform.status).toBe(404);
  });
});
