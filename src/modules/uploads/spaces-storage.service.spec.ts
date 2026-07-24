import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import {
  ObjectTooLargeError,
  SpacesStorageService,
} from './spaces-storage.service';

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
    .spyOn(
      service as unknown as { putObject: () => Promise<void> },
      'putObject',
    )
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

    await service.uploadVideoBuffer(
      Buffer.from('v'),
      'application/octet-stream',
    );

    expect(putObject).toHaveBeenCalledWith(
      expect.stringMatching(/\.mp4$/),
      expect.any(Buffer),
      'video/mp4',
    );
  });
});

describe('SpacesStorageService.getObjectBuffer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads with the default 300MB cap and a timeout', async () => {
    const { service } = createService();
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: new ArrayBuffer(4), headers: {} } as never);

    await service.getObjectBuffer('octoai_images/a.jpg');

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('octoai_images/a.jpg'),
      expect.objectContaining({
        maxContentLength: 314572800,
        maxBodyLength: 314572800,
        timeout: 120000,
      }),
    );
  });

  it('maps axios cap overruns to ObjectTooLargeError', async () => {
    const { service } = createService();
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue(
        new Error('maxContentLength size of 314572800 exceeded'),
      );

    await expect(
      service.getObjectBuffer('octoai_videos/huge.mp4'),
    ).rejects.toBeInstanceOf(ObjectTooLargeError);
  });

  it('rethrows unrelated download errors untouched', async () => {
    const { service } = createService();
    const failure = new Error('socket hang up');
    jest.spyOn(axios, 'get').mockRejectedValue(failure);

    await expect(service.getObjectBuffer('octoai_images/a.jpg')).rejects.toBe(
      failure,
    );
  });
});

describe('SpacesStorageService cascade video idempotency', () => {
  it('adopts the committed manifest after a crash without a second source upload', async () => {
    const { service } = createService();
    const idempotencyKey =
      'ltx-cascade:cascade_endpoint_12345678:runpod_job_12345678';
    const assetId = createHash('sha256')
      .update(`ltx-cascade-video:${idempotencyKey}`)
      .digest('hex');
    const videoKey = `octoai_videos/cascade/${assetId}.mp4`;
    const previewKey = `octoai_videos/cascade/${assetId}_preview.jpg`;
    const asset = {
      videoUrl: `https://api.test/media/video/upload/${videoKey}`,
      previewImageUrl: `https://api.test/media/image/upload/${previewKey}`,
      width: 1280,
      height: 704,
      hasAudio: true,
      sourceSha256: 'a'.repeat(64),
    };
    const manifest = {
      version: 1 as const,
      videoKey,
      previewKey,
      width: 1280,
      height: 704,
      hasAudio: true,
      sourceSha256: 'a'.repeat(64),
    };
    let committed = false;
    const readManifest = jest
      .spyOn(
        service as unknown as {
          readCascadeVideoManifest: (
            assetId: string,
          ) => Promise<typeof asset | null>;
        },
        'readCascadeVideoManifest',
      )
      .mockImplementation(async () => (committed ? asset : null));
    const store = jest
      .spyOn(
        service as unknown as {
          storeVideoAssetFromSource: (
            source: string,
            assetId: string,
          ) => Promise<{
            asset: typeof asset;
            manifest: typeof manifest;
          }>;
        },
        'storeVideoAssetFromSource',
      )
      .mockResolvedValue({ asset, manifest });
    const putManifest = jest
      .spyOn(
        service as unknown as {
          putPrivateObject: (
            key: string,
            body: Buffer,
            contentType: string,
          ) => Promise<void>;
        },
        'putPrivateObject',
      )
      .mockImplementation(async () => {
        committed = true;
      });

    await expect(
      service.uploadVideoAssetFromSourceOnce(
        'https://provider.test/private-result.mp4',
        idempotencyKey,
      ),
    ).resolves.toEqual(asset);
    await expect(
      service.uploadVideoAssetFromSourceOnce(
        'https://provider.test/private-result.mp4',
        idempotencyKey,
      ),
    ).resolves.toEqual(asset);

    expect(readManifest).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      'https://provider.test/private-result.mp4',
      `cascade/${assetId}`,
    );
    expect(putManifest).toHaveBeenCalledTimes(1);
    expect(putManifest).toHaveBeenCalledWith(
      `octoai_videos/cascade/${assetId}.json`,
      expect.any(Buffer),
      'application/json',
    );
    const manifestBody = JSON.parse(
      (putManifest.mock.calls[0][1] as Buffer).toString('utf8'),
    );
    expect(manifestBody).toEqual(manifest);
    expect(JSON.stringify(manifestBody)).not.toContain('provider.test');
  });
});

describe('SpacesStorageService private cascade video lifecycle', () => {
  const idempotencyKey =
    'ltx-cascade:cascade_endpoint_12345678:runpod_job_12345678';
  const sourceBytes = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const dataUri = `data:video/mp4;base64,${sourceBytes.toString('base64')}`;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    'http://127.0.0.1/private.mp4',
    'https://provider.test/private.mp4',
    `data:video/webm;base64,${sourceBytes.toString('base64')}`,
    `data:application/octet-stream;base64,${sourceBytes.toString('base64')}`,
  ])('rejects non-inline-MP4 source %s before any I/O', async (source) => {
    const { service } = createService();
    const fetchMedia = jest.spyOn(
      service as unknown as {
        fetchMedia: (
          source: string,
          fallbackContentType: string,
        ) => Promise<{ buffer: Buffer; contentType: string }>;
      },
      'fetchMedia',
    );
    const axiosGet = jest.spyOn(axios, 'get');
    const getClient = jest.spyOn(
      service as unknown as { getClient: () => unknown },
      'getClient',
    );

    await expect(
      service.stagePrivateVideoFromDataOnce(source, idempotencyKey),
    ).rejects.toThrow('VIDEO_STAGE_SOURCE_INVALID');

    expect(fetchMedia).not.toHaveBeenCalled();
    expect(axiosGet).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('stages under deterministic private keys and adopts only the exact same SHA', async () => {
    const { service } = createService();
    const assetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const privateArtifactRef = `video_stage_${assetId}`;
    const staged = {
      privateArtifactRef,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    let committed = false;

    const fetchMedia = jest
      .spyOn(
        service as unknown as {
          fetchMedia: () => Promise<{
            buffer: Buffer;
            contentType: string;
          }>;
        },
        'fetchMedia',
      )
      .mockImplementation(async () => ({
        buffer: Buffer.from(sourceBytes),
        contentType: 'video/mp4',
      }));
    jest.spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/media-stage-test');
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    const probeVideo = jest
      .spyOn(
        service as unknown as {
          probeVideo: () => Promise<{
            width: number;
            height: number;
            hasAudio: boolean;
          }>;
        },
        'probeVideo',
      )
      .mockResolvedValue({ width: 1280, height: 704, hasAudio: true });
    jest
      .spyOn(
        service as unknown as {
          extractPreviewFrame: () => Promise<Buffer | null>;
        },
        'extractPreviewFrame',
      )
      .mockResolvedValue(null);
    const readStaged = jest
      .spyOn(
        service as unknown as {
          readStagedPrivateVideo: () => Promise<typeof staged | null>;
        },
        'readStagedPrivateVideo',
      )
      .mockImplementation(async () => (committed ? staged : null));
    const privatePut = jest
      .spyOn(
        service as unknown as {
          putPrivateObject: (
            key: string,
            body: Buffer,
            contentType: string,
          ) => Promise<void>;
        },
        'putPrivateObject',
      )
      .mockImplementation(async (key) => {
        if (key.endsWith('.json')) committed = true;
      });

    await expect(
      service.stagePrivateVideoFromDataOnce(dataUri, idempotencyKey),
    ).resolves.toEqual(staged);
    await expect(
      service.stagePrivateVideoFromDataOnce(dataUri, idempotencyKey),
    ).resolves.toEqual(staged);

    expect(fetchMedia).toHaveBeenCalledTimes(2);
    expect(readStaged).toHaveBeenCalledTimes(3);
    expect(probeVideo).toHaveBeenCalledTimes(1);
    expect(privatePut).toHaveBeenCalledTimes(2);
    expect(privatePut.mock.calls.map(([key]) => key)).toEqual([
      `octoai_videos/quarantine/${assetId}.mp4`,
      `octoai_videos/quarantine/${assetId}.json`,
    ]);
    const manifest = JSON.parse(
      (privatePut.mock.calls[1][1] as Buffer).toString('utf8'),
    );
    expect(manifest).toMatchObject({
      privateArtifactRef,
      videoKey: `octoai_videos/quarantine/${assetId}.mp4`,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
    });
  });

  it('fails closed when the same staging idempotency key produces changed bytes', async () => {
    const { service } = createService();
    const assetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const existing = {
      privateArtifactRef: `video_stage_${assetId}`,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    const changedBytes = Buffer.from(sourceBytes);
    changedBytes[changedBytes.length - 1] ^= 0xff;
    jest
      .spyOn(
        service as unknown as {
          fetchMedia: () => Promise<{
            buffer: Buffer;
            contentType: string;
          }>;
        },
        'fetchMedia',
      )
      .mockResolvedValue({
        buffer: changedBytes,
        contentType: 'video/mp4',
      });
    jest
      .spyOn(
        service as unknown as {
          readStagedPrivateVideo: () => Promise<typeof existing>;
        },
        'readStagedPrivateVideo',
      )
      .mockResolvedValue(existing);
    const privatePut = jest.spyOn(
      service as unknown as {
        putPrivateObject: () => Promise<void>;
      },
      'putPrivateObject',
    );

    await expect(
      service.stagePrivateVideoFromDataOnce(
        `data:video/mp4;base64,${changedBytes.toString('base64')}`,
        idempotencyKey,
      ),
    ).rejects.toThrow('VIDEO_STAGE_IDEMPOTENCY_MISMATCH');

    expect(privatePut).not.toHaveBeenCalled();
  });

  it('omits public ACL and cache headers from private object PUTs', async () => {
    const { service } = createService();
    const send = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
    jest
      .spyOn(
        service as unknown as {
          getClient: () => { send: typeof send };
        },
        'getClient',
      )
      .mockReturnValue({ send });

    await (
      service as unknown as {
        putPrivateObject: (
          key: string,
          body: Buffer,
          contentType: string,
        ) => Promise<void>;
      }
    ).putPrivateObject(
      'octoai_videos/quarantine/private.mp4',
      Buffer.from(sourceBytes),
      'video/mp4',
    );

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Bucket: 'bucket',
      Key: 'octoai_videos/quarantine/private.mp4',
      ContentType: 'video/mp4',
    });
    expect(command.input).not.toHaveProperty('ACL');
    expect(command.input).not.toHaveProperty('CacheControl');
  });

  it('verifies the QC-accepted SHA and commits the public manifest last', async () => {
    const { service, putObject } = createService();
    const publishIdempotencyKey = `${idempotencyKey}:publish`;
    const stageAssetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const privateArtifactRef = `video_stage_${stageAssetId}`;
    const staged = {
      privateArtifactRef,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    const stageManifest = {
      version: 1 as const,
      privateArtifactRef,
      videoKey: `octoai_videos/quarantine/${stageAssetId}.mp4`,
      previewKey: null,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    const published = {
      videoUrl: 'https://api.test/media/video/upload/published.mp4',
      previewImageUrl: null,
      width: 1280,
      height: 704,
      hasAudio: true,
      sourceSha256,
    };
    const loadStaged = jest
      .spyOn(service, 'loadStagedPrivateVideo')
      .mockResolvedValue(staged);
    jest
      .spyOn(
        service as unknown as {
          readStagedPrivateVideoManifest: () => Promise<typeof stageManifest>;
        },
        'readStagedPrivateVideoManifest',
      )
      .mockResolvedValue(stageManifest);
    const readPublished = jest
      .spyOn(
        service as unknown as {
          readCascadeVideoManifest: (
            assetId: string,
            expectedSha256: string,
          ) => Promise<typeof published | null>;
        },
        'readCascadeVideoManifest',
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(published);
    jest
      .spyOn(
        service as unknown as {
          getPrivateObjectBuffer: () => Promise<Buffer>;
        },
        'getPrivateObjectBuffer',
      )
      .mockResolvedValue(Buffer.from(sourceBytes));
    const privatePut = jest
      .spyOn(
        service as unknown as {
          putPrivateObject: (
            key: string,
            body: Buffer,
            contentType: string,
          ) => Promise<void>;
        },
        'putPrivateObject',
      )
      .mockResolvedValue(undefined);

    await expect(
      service.publishStagedVideoOnce(
        privateArtifactRef,
        sourceSha256,
        publishIdempotencyKey,
      ),
    ).resolves.toEqual(published);

    const publishedAssetId = createHash('sha256')
      .update(`ltx-cascade-publish:${publishIdempotencyKey}`)
      .digest('hex');
    expect(loadStaged).toHaveBeenCalledWith(privateArtifactRef, sourceSha256);
    expect(readPublished).toHaveBeenNthCalledWith(
      1,
      publishedAssetId,
      sourceSha256,
    );
    expect(readPublished).toHaveBeenNthCalledWith(
      2,
      publishedAssetId,
      sourceSha256,
    );
    expect(putObject).toHaveBeenCalledWith(
      `octoai_videos/cascade/${publishedAssetId}.mp4`,
      expect.any(Buffer),
      'video/mp4',
    );
    expect(privatePut).toHaveBeenCalledWith(
      `octoai_videos/cascade/${publishedAssetId}.json`,
      expect.any(Buffer),
      'application/json',
    );
    expect(putObject.mock.invocationCallOrder[0]).toBeLessThan(
      privatePut.mock.invocationCallOrder[0],
    );
    const manifest = JSON.parse(
      (privatePut.mock.calls[0][1] as Buffer).toString('utf8'),
    );
    expect(manifest).toMatchObject({
      videoKey: `octoai_videos/cascade/${publishedAssetId}.mp4`,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
    });
  });

  it('does not publish when staged bytes differ from the expected SHA', async () => {
    const { service, putObject } = createService();
    const assetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const privateArtifactRef = `video_stage_${assetId}`;
    const staged = {
      privateArtifactRef,
      byteLength: sourceBytes.byteLength,
      sourceSha256,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    jest.spyOn(service, 'loadStagedPrivateVideo').mockResolvedValue(staged);
    jest
      .spyOn(
        service as unknown as {
          readStagedPrivateVideoManifest: () => Promise<{
            videoKey: string;
            previewKey: null;
          }>;
        },
        'readStagedPrivateVideoManifest',
      )
      .mockResolvedValue({
        videoKey: `octoai_videos/quarantine/${assetId}.mp4`,
        previewKey: null,
      });
    jest
      .spyOn(
        service as unknown as {
          readCascadeVideoManifest: () => Promise<null>;
        },
        'readCascadeVideoManifest',
      )
      .mockResolvedValue(null);
    const changedBytes = Buffer.from(sourceBytes);
    changedBytes[0] ^= 0xff;
    jest
      .spyOn(
        service as unknown as {
          getPrivateObjectBuffer: () => Promise<Buffer>;
        },
        'getPrivateObjectBuffer',
      )
      .mockResolvedValue(changedBytes);
    const privatePut = jest.spyOn(
      service as unknown as {
        putPrivateObject: () => Promise<void>;
      },
      'putPrivateObject',
    );

    await expect(
      service.publishStagedVideoOnce(
        privateArtifactRef,
        sourceSha256,
        `${idempotencyKey}:publish`,
      ),
    ).rejects.toThrow('VIDEO_STAGE_HASH_MISMATCH');

    expect(putObject).not.toHaveBeenCalled();
    expect(privatePut).not.toHaveBeenCalled();
  });

  it('deletes a committed stage once and treats an already-missing stage as success', async () => {
    const { service } = createService();
    const assetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const privateArtifactRef = `video_stage_${assetId}`;
    const manifest = {
      videoKey: `octoai_videos/quarantine/${assetId}.mp4`,
      previewKey: `octoai_videos/quarantine/${assetId}_preview.jpg`,
    };
    jest
      .spyOn(
        service as unknown as {
          readStagedPrivateVideoManifest: () => Promise<typeof manifest | null>;
        },
        'readStagedPrivateVideoManifest',
      )
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce(null);
    const send = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
    jest
      .spyOn(
        service as unknown as {
          getClient: () => { send: typeof send };
        },
        'getClient',
      )
      .mockReturnValue({ send });

    await expect(
      service.deleteStagedPrivateVideo(privateArtifactRef),
    ).resolves.toBeUndefined();
    await expect(
      service.deleteStagedPrivateVideo(privateArtifactRef),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(3);
    expect(
      send.mock.calls.map(
        ([command]) => (command as { input: { Key: string } }).input.Key,
      ),
    ).toEqual([
      manifest.videoKey,
      manifest.previewKey,
      `octoai_videos/quarantine/${assetId}.json`,
    ]);
  });
});

describe('SpacesStorageService private immutable checkpoints', () => {
  const key = `private/ltx-cascade/stills/${'a'.repeat(64)}.png`;
  const body = Buffer.from('immutable-private-checkpoint');
  const sha256 = createHash('sha256').update(body).digest('hex');
  const metadata = {
    schema: 'ltx-pruna-still-v1',
    artifactref: `pruna_still_${'a'.repeat(64)}`,
    sha256,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockPrivateRead(
    service: SpacesStorageService,
    overrides: Partial<{
      body: Buffer;
      contentType: string;
      contentLength: number;
      cacheControl: string;
      metadata: Record<string, string>;
    }> = {},
  ) {
    return jest
      .spyOn(
        service as unknown as {
          getPrivateObjectRecord: () => Promise<{
            body: Buffer;
            contentType: string;
            contentLength: number;
            cacheControl: string;
            metadata: Record<string, string>;
          }>;
        },
        'getPrivateObjectRecord',
      )
      .mockResolvedValue({
        body: Buffer.from(body),
        contentType: 'image/png',
        contentLength: body.byteLength,
        cacheControl: 'private, no-store, max-age=0',
        metadata,
        ...overrides,
      });
  }

  it('uses a conditional private PUT with no public ACL and verifies read-back', async () => {
    const { service } = createService();
    const send = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
    jest
      .spyOn(
        service as unknown as {
          getClient: () => { send: typeof send };
        },
        'getClient',
      )
      .mockReturnValue({ send });
    const readBack = mockPrivateRead(service);

    await expect(
      service.putPrivateImmutableObjectOnce({
        key,
        body,
        contentType: 'image/png',
        byteLength: body.byteLength,
        sha256,
        metadata,
        maxBytes: 1024,
      }),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Bucket: 'bucket',
      Key: key,
      ContentType: 'image/png',
      CacheControl: 'private, no-store, max-age=0',
      Metadata: metadata,
      IfNoneMatch: '*',
    });
    expect(command.input).not.toHaveProperty('ACL');
    expect(readBack).toHaveBeenCalledWith(key, 1024);
  });

  it('adopts an existing conditional-write winner only when bytes and metadata match', async () => {
    const { service } = createService();
    const precondition = Object.assign(new Error('already exists'), {
      $metadata: { httpStatusCode: 412 },
    });
    const send = jest.fn<Promise<unknown>, [unknown]>(async () =>
      Promise.reject(precondition),
    );
    jest
      .spyOn(
        service as unknown as {
          getClient: () => { send: typeof send };
        },
        'getClient',
      )
      .mockReturnValue({ send });
    mockPrivateRead(service);

    await expect(
      service.putPrivateImmutableObjectOnce({
        key,
        body,
        contentType: 'image/png',
        byteLength: body.byteLength,
        sha256,
        metadata,
        maxBytes: 1024,
      }),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never adopts conflicting content at an existing checkpoint key', async () => {
    const { service } = createService();
    const precondition = Object.assign(new Error('already exists'), {
      $metadata: { httpStatusCode: 412 },
    });
    const send = jest.fn<Promise<unknown>, [unknown]>(async () =>
      Promise.reject(precondition),
    );
    jest
      .spyOn(
        service as unknown as {
          getClient: () => { send: typeof send };
        },
        'getClient',
      )
      .mockReturnValue({ send });
    mockPrivateRead(service, {
      body: Buffer.from('different-private-checkpoint'),
      contentLength: body.byteLength,
    });

    await expect(
      service.putPrivateImmutableObjectOnce({
        key,
        body,
        contentType: 'image/png',
        byteLength: body.byteLength,
        sha256,
        metadata,
        maxBytes: 1024,
      }),
    ).rejects.toThrow('PRIVATE_OBJECT_IMMUTABILITY_MISMATCH');
  });
});
