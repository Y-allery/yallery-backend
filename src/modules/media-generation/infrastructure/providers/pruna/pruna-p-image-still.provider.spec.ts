import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { PrunaPImageStillProvider } from './pruna-p-image-still.provider';
import {
  PrunaDownloadedJpeg,
  PrunaPImageGenerationInput,
  PrunaPredictionStatus,
  PrunaStillSubmission,
} from './pruna-p-image.types';
import { PrunaStillCanonicalizer } from './pruna-still-canonicalizer';
import {
  asPrivateStillArtifactRef,
  PrivateCanonicalPngWrite,
  PrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from './pruna-still-artifact.store';

describe('PrunaPImageStillProvider', () => {
  const policySha256 = 'd'.repeat(64);
  let sourceJpeg: Buffer;

  beforeAll(async () => {
    const rgb = Buffer.allocUnsafe(1280 * 704 * 3);
    for (let y = 0; y < 704; y += 1) {
      for (let x = 0; x < 1280; x += 1) {
        const index = (y * 1280 + x) * 3;
        rgb[index] = Math.floor(x / 8) % 256;
        rgb[index + 1] = Math.floor(y / 4) % 256;
        rgb[index + 2] = ((Math.floor(x / 32) + Math.floor(y / 32)) * 17) % 256;
      }
    }
    sourceJpeg = await sharp(rgb, {
      raw: { width: 1280, height: 704, channels: 3 },
    })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();
  });

  const createClient = () => {
    const downloadedBytes = Buffer.from(sourceJpeg);
    let firstDownload = true;
    return {
      downloadedBytes,
      client: {
        submit: jest.fn<
          Promise<PrunaStillSubmission>,
          [PrunaPImageGenerationInput, string]
        >(),
        getStatus: jest.fn<Promise<PrunaPredictionStatus>, [string, string]>(),
        downloadSucceededJpeg: jest.fn(
          async (
            _predictionId: string,
            _expectedPolicySha256: string,
          ): Promise<PrunaDownloadedJpeg> => {
            const bytes = firstDownload
              ? downloadedBytes
              : Buffer.from(sourceJpeg);
            firstDownload = false;
            return {
              bytes,
              mime: 'image/jpeg',
              byteLength: bytes.byteLength,
              sha256: sha256(bytes),
            };
          },
        ),
      },
    };
  };

  it('delegates submit and status without adding a public provider route', async () => {
    const { client } = createClient();
    const store = new InMemoryPrivateStillStore();
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );
    const input = {
      prompt: 'One dancer in an empty studio.',
      width: 1280 as const,
      height: 704 as const,
      seed: 33103,
    };
    client.submit.mockResolvedValue({
      certainty: 'accepted',
      predictionId: 'prediction_12345678',
      requestHash: 'a'.repeat(64),
    });
    client.getStatus.mockResolvedValue({ status: 'processing' });

    await expect(provider.submit(input, policySha256)).resolves.toMatchObject({
      certainty: 'accepted',
    });
    await expect(
      provider.getStatus('prediction_12345678', policySha256),
    ).resolves.toEqual({
      status: 'processing',
    });
    expect(client.submit).toHaveBeenCalledWith(input, policySha256);
    expect(client.getStatus).toHaveBeenCalledWith(
      'prediction_12345678',
      policySha256,
    );
  });

  it('stores one canonical private PNG and returns identical verified bytes to QC and LTX', async () => {
    const { client, downloadedBytes } = createClient();
    const originalSourceSha = sha256(downloadedBytes);
    const store = new InMemoryPrivateStillStore();
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );

    const artifact = await provider.materialize(
      {
        predictionId: 'prediction_12345678',
        width: 1280,
        height: 704,
      },
      policySha256,
    );
    const qcBytes = await provider.loadCanonicalBytes(artifact);
    const ltxBytes = await provider.loadCanonicalBytes(artifact);
    const metadata = await sharp(qcBytes).metadata();

    expect(client.downloadSucceededJpeg).toHaveBeenCalledWith(
      'prediction_12345678',
      policySha256,
    );
    expect(artifact).toMatchObject({
      sourceMime: 'image/jpeg',
      sourceByteLength: sourceJpeg.byteLength,
      sourceSha256: originalSourceSha,
      canonicalMime: 'image/png',
      canonicalByteLength: qcBytes.byteLength,
      canonicalSha256: sha256(qcBytes),
      width: 1280,
      height: 704,
      downloadDurationMs: expect.any(Number),
      canonicalizeDurationMs: expect.any(Number),
    });
    expect(artifact.downloadDurationMs).toBeGreaterThanOrEqual(0);
    expect(artifact.canonicalizeDurationMs).toBeGreaterThanOrEqual(0);
    expect(String(artifact.privateArtifactRef)).not.toContain('://');
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1280,
      height: 704,
      space: 'srgb',
      channels: 3,
    });
    expect(qcBytes).toEqual(ltxBytes);
    expect(qcBytes).not.toBe(ltxBytes);
    expect(store.putCount).toBe(1);
    expect(store.readCount).toBe(3);
    expect(downloadedBytes.every((value) => value === 0)).toBe(true);
  });

  it('adopts the same deterministic private object across materialization retries', async () => {
    const { client } = createClient();
    const store = new InMemoryPrivateStillStore();
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );
    const request = {
      predictionId: 'prediction_12345678',
      width: 1280 as const,
      height: 704 as const,
    };

    const first = await provider.materialize(request, policySha256);
    const retried = await provider.materialize(request, policySha256);

    expect(retried.privateArtifactRef).toBe(first.privateArtifactRef);
    expect(retried.canonicalSha256).toBe(first.canonicalSha256);
    expect(store.putCount).toBe(2);
    expect(store.createCount).toBe(1);
    expect(store.size).toBe(1);
  });

  it('deletes and rejects a corrupt store read-back', async () => {
    const { client } = createClient();
    const store = new InMemoryPrivateStillStore();
    store.corruptNextRead = true;
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );

    await expect(
      provider.materialize(
        {
          predictionId: 'prediction_12345678',
          width: 1280,
          height: 704,
        },
        policySha256,
      ),
    ).rejects.toMatchObject({
      message: 'PRUNA_ARTIFACT_INTEGRITY_FAILED',
      metadata: {
        stage: 'artifact_read',
        reasonCode: 'PRUNA_ARTIFACT_INTEGRITY_FAILED',
      },
    });
    expect(store.deleteCount).toBe(1);
    expect(store.size).toBe(0);
  });

  it('detects later artifact mutation before bytes can reach QC or LTX', async () => {
    const { client } = createClient();
    const store = new InMemoryPrivateStillStore();
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );
    const artifact = await provider.materialize(
      {
        predictionId: 'prediction_12345678',
        width: 1280,
        height: 704,
      },
      policySha256,
    );
    store.corrupt(artifact.privateArtifactRef);

    await expect(provider.loadCanonicalBytes(artifact)).rejects.toMatchObject({
      message: 'PRUNA_ARTIFACT_INTEGRITY_FAILED',
      metadata: { reasonCode: 'PRUNA_ARTIFACT_INTEGRITY_FAILED' },
    });
  });

  it('redacts private-store exceptions', async () => {
    const { client } = createClient();
    const forbidden =
      'raw-prompt api-key https://public.example/checkpoint.png raw-base64';
    const store: PrunaStillArtifactStore = {
      putCanonicalPng: jest.fn().mockRejectedValue(new Error(forbidden)),
      readCanonicalPng: jest.fn(),
      deleteCanonicalPng: jest.fn(),
    };
    const provider = new PrunaPImageStillProvider(
      client,
      new PrunaStillCanonicalizer(),
      store,
    );

    let caught: unknown;
    try {
      await provider.materialize(
        {
          predictionId: 'prediction_12345678',
          width: 1280,
          height: 704,
        },
        policySha256,
      );
    } catch (error) {
      caught = error;
    }

    const serialized = JSON.stringify(caught);
    expect(serialized).toContain('PRUNA_ARTIFACT_STORE_FAILED');
    expect(serialized).not.toContain('raw-prompt');
    expect(serialized).not.toContain('api-key');
    expect(serialized).not.toContain('public.example');
    expect(serialized).not.toContain('raw-base64');
  });

  it('rejects URL-shaped values as private artifact references', () => {
    expect(() =>
      asPrivateStillArtifactRef('https://public.example/checkpoint.png'),
    ).toThrow(
      expect.objectContaining({
        message: 'PRUNA_ARTIFACT_STORE_FAILED',
        metadata: {
          stage: 'store',
          reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
          retryable: false,
          certainty: 'accepted',
        },
      }),
    );
  });
});

class InMemoryPrivateStillStore implements PrunaStillArtifactStore {
  private readonly objects = new Map<PrivateStillArtifactRef, Buffer>();
  putCount = 0;
  createCount = 0;
  readCount = 0;
  deleteCount = 0;
  corruptNextRead = false;

  get size(): number {
    return this.objects.size;
  }

  async putCanonicalPng(
    artifact: Readonly<PrivateCanonicalPngWrite>,
  ): Promise<void> {
    this.putCount += 1;
    const existing = this.objects.get(artifact.privateArtifactRef);
    if (existing) {
      if (
        existing.byteLength !== artifact.byteLength ||
        sha256(existing) !== artifact.sha256 ||
        !existing.equals(artifact.bytes)
      ) {
        throw new Error('immutable object conflict');
      }
      return;
    }
    this.objects.set(artifact.privateArtifactRef, Buffer.from(artifact.bytes));
    this.createCount += 1;
  }

  async readCanonicalPng(ref: PrivateStillArtifactRef): Promise<Buffer> {
    this.readCount += 1;
    const bytes = this.objects.get(ref);
    if (!bytes) {
      throw new Error('missing private object');
    }
    const copy = Buffer.from(bytes);
    if (this.corruptNextRead) {
      this.corruptNextRead = false;
      copy[copy.byteLength - 1] ^= 0xff;
    }
    return copy;
  }

  async deleteCanonicalPng(ref: PrivateStillArtifactRef): Promise<void> {
    this.deleteCount += 1;
    this.objects.delete(ref);
  }

  corrupt(ref: PrivateStillArtifactRef): void {
    const bytes = this.objects.get(ref);
    if (!bytes) {
      throw new Error('missing private object');
    }
    bytes[32] ^= 0xff;
  }
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
