import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { SpacesStorageService } from 'src/modules/uploads/spaces-storage.service';
import { asPrivateStillArtifactRef } from './pruna-still-artifact.store';
import { SpacesPrunaStillArtifactStore } from './spaces-pruna-still-artifact.store';

const REF = asPrivateStillArtifactRef(`pruna_still_${'a'.repeat(64)}`);
const KEY = `private/ltx-cascade/stills/${'a'.repeat(64)}.png`;
const CACHE_CONTROL = 'private, no-store, max-age=0';

describe('SpacesPrunaStillArtifactStore', () => {
  async function fixture() {
    const png = await sharp({
      create: {
        width: 1280,
        height: 704,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .png({ palette: false })
      .toBuffer();
    const sha256 = createHash('sha256').update(png).digest('hex');
    const metadata = {
      schema: 'ltx-pruna-still-v1',
      artifactref: REF,
      sha256,
      bytelength: String(png.byteLength),
      width: '1280',
      height: '704',
    };
    const spaces = {
      isConfigured: jest.fn(() => true),
      putPrivateImmutableObjectOnce: jest.fn(async () => undefined),
      readPrivateImmutableObject: jest.fn(async () => ({
        body: Buffer.from(png),
        contentType: 'image/png',
        contentLength: png.byteLength,
        cacheControl: CACHE_CONTROL,
        metadata,
      })),
      deletePrivateImmutableObject: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<SpacesStorageService>;
    return {
      png,
      sha256,
      metadata,
      spaces,
      store: new SpacesPrunaStillArtifactStore(spaces),
    };
  }

  it('writes one opaque private immutable object with exact integrity metadata', async () => {
    const { png, sha256, metadata, spaces, store } = await fixture();

    await expect(
      store.putCanonicalPng({
        privateArtifactRef: REF,
        bytes: png,
        mime: 'image/png',
        byteLength: png.byteLength,
        sha256,
        width: 1280,
        height: 704,
      }),
    ).resolves.toBeUndefined();

    expect(spaces.putPrivateImmutableObjectOnce).toHaveBeenCalledWith({
      key: KEY,
      body: png,
      contentType: 'image/png',
      byteLength: png.byteLength,
      sha256,
      metadata,
      maxBytes: 6 * 1024 * 1024,
    });
    expect(
      JSON.stringify(spaces.putPrivateImmutableObjectOnce.mock.calls),
    ).not.toContain('://');
  });

  it('reads only a committed checkpoint matching its self-verifying metadata', async () => {
    const { png, spaces, store } = await fixture();
    const storedBody = Buffer.from(png);
    spaces.readPrivateImmutableObject.mockResolvedValueOnce({
      body: storedBody,
      contentType: 'image/png',
      contentLength: png.byteLength,
      cacheControl: CACHE_CONTROL,
      metadata: {
        schema: 'ltx-pruna-still-v1',
        artifactref: REF,
        sha256: createHash('sha256').update(png).digest('hex'),
        bytelength: String(png.byteLength),
        width: '1280',
        height: '704',
      },
    });

    const loaded = await store.readCanonicalPng(REF);

    expect(loaded).toEqual(png);
    expect(loaded).not.toBe(storedBody);
    expect(storedBody.every((value) => value === 0)).toBe(true);
    expect(spaces.readPrivateImmutableObject).toHaveBeenCalledWith(
      KEY,
      6 * 1024 * 1024,
    );
  });

  it('fails closed on metadata or byte drift', async () => {
    const { png, spaces, store } = await fixture();
    spaces.readPrivateImmutableObject.mockResolvedValueOnce({
      body: Buffer.from(png),
      contentType: 'image/png',
      contentLength: png.byteLength,
      cacheControl: CACHE_CONTROL,
      metadata: {
        schema: 'ltx-pruna-still-v1',
        artifactref: REF,
        sha256: 'b'.repeat(64),
        bytelength: String(png.byteLength),
        width: '1280',
        height: '704',
      },
    });

    await expect(store.readCanonicalPng(REF)).rejects.toMatchObject({
      metadata: {
        reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
        retryable: false,
      },
    });
  });

  it('deletes only the deterministic private object key', async () => {
    const { spaces, store } = await fixture();

    await expect(store.deleteCanonicalPng(REF)).resolves.toBeUndefined();

    expect(spaces.deletePrivateImmutableObject).toHaveBeenCalledWith(KEY);
  });

  it('reports readiness from the existing Spaces configuration', async () => {
    const { spaces, store } = await fixture();
    spaces.isConfigured.mockReturnValue(false);

    expect(store.isConfigured()).toBe(false);
  });
});
