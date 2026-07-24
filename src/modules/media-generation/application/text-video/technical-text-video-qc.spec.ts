import * as sharp from 'sharp';
import {
  STILL_TECHNICAL_QC_POLICY_VERSION,
  TechnicalTextVideoStillQc,
  TechnicalTextVideoVideoQc,
  VIDEO_TECHNICAL_QC_POLICY_VERSION,
  readMvhdDurationSeconds,
} from './technical-text-video-qc';
import { CanonicalPrunaStillArtifact } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image-still.provider';
import { StagedCascadeVideo } from './text-video-pipeline.ports';

const stillArtifact = (
  overrides: Partial<CanonicalPrunaStillArtifact> = {},
): CanonicalPrunaStillArtifact => ({
  privateArtifactRef:
    'still_canonical_0000000000000000000000000000000000000000000000000000000000000000' as CanonicalPrunaStillArtifact['privateArtifactRef'],
  sourceMime: 'image/jpeg',
  sourceByteLength: 1000,
  sourceSha256: 'a'.repeat(64),
  canonicalMime: 'image/png',
  canonicalByteLength: 1000,
  canonicalSha256: 'b'.repeat(64),
  decodedRgbSha256: 'c'.repeat(64),
  width: 1280,
  height: 704,
  ...overrides,
});

async function pngWithGradient(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = x % 256;
      raw[i + 1] = y % 256;
      raw[i + 2] = (x + y) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function pngSolid(
  width: number,
  height: number,
  value: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: value, g: value, b: value },
    },
  })
    .png()
    .toBuffer();
}

describe('TechnicalTextVideoStillQc', () => {
  const qc = new TechnicalTextVideoStillQc();
  const policyVersion = STILL_TECHNICAL_QC_POLICY_VERSION;

  it('is configured', () => {
    expect(qc.isConfigured()).toBe(true);
  });

  it('passes a decodable textured still with exact dimensions', async () => {
    const result = await qc.evaluate({
      canonicalPng: await pngWithGradient(1280, 704),
      artifact: stillArtifact(),
      stillPromptSha256: 'd'.repeat(64),
      policyVersion,
    });
    expect(result).toMatchObject({ decision: 'pass', reasonCode: null });
  });

  it('errors on unsupported policy version', async () => {
    const result = await qc.evaluate({
      canonicalPng: await pngWithGradient(1280, 704),
      artifact: stillArtifact(),
      stillPromptSha256: 'd'.repeat(64),
      policyVersion: 'still-qc-disabled-v1',
    });
    expect(result).toMatchObject({
      decision: 'error',
      reasonCode: 'STILL_QC_POLICY_UNSUPPORTED',
    });
  });

  it('errors on undecodable bytes', async () => {
    const result = await qc.evaluate({
      canonicalPng: Buffer.from('definitely not a png'),
      artifact: stillArtifact(),
      stillPromptSha256: 'd'.repeat(64),
      policyVersion,
    });
    expect(result).toMatchObject({
      decision: 'error',
      reasonCode: 'STILL_QC_DECODE_ERROR',
    });
  });

  it('rejects a dimension mismatch', async () => {
    const result = await qc.evaluate({
      canonicalPng: await pngWithGradient(640, 352),
      artifact: stillArtifact(),
      stillPromptSha256: 'd'.repeat(64),
      policyVersion,
    });
    expect(result).toMatchObject({
      decision: 'reject',
      reasonCode: 'STILL_QC_DIMENSION_MISMATCH',
    });
  });

  it('rejects a flat solid image', async () => {
    const result = await qc.evaluate({
      canonicalPng: await pngSolid(1280, 704, 128),
      artifact: stillArtifact(),
      stillPromptSha256: 'd'.repeat(64),
      policyVersion,
    });
    expect(result).toMatchObject({
      decision: 'reject',
      reasonCode: 'STILL_QC_FLAT_IMAGE',
    });
  });
});

function syntheticMp4(options: {
  durationSeconds: number | null;
  totalBytes: number;
  mvhdVersion?: 0 | 1;
}): Buffer {
  const buf = Buffer.alloc(options.totalBytes);
  buf.writeUInt32BE(16, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write('isom', 8, 'ascii');
  if (options.durationSeconds !== null) {
    const at = 32;
    buf.write('mvhd', at, 'ascii');
    const body = at + 4;
    const version = options.mvhdVersion ?? 0;
    buf.writeUInt8(version, body);
    if (version === 0) {
      buf.writeUInt32BE(1000, body + 12);
      buf.writeUInt32BE(Math.round(options.durationSeconds * 1000), body + 16);
    } else {
      buf.writeUInt32BE(1000, body + 20);
      buf.writeBigUInt64BE(
        BigInt(Math.round(options.durationSeconds * 1000)),
        body + 24,
      );
    }
  }
  return buf;
}

const stagedVideo = (
  bytes: Buffer,
  overrides: Partial<StagedCascadeVideo> = {},
): StagedCascadeVideo => ({
  privateArtifactRef: `video_stage_${'e'.repeat(64)}`,
  artifactSha256: 'f'.repeat(64),
  byteLength: bytes.byteLength,
  width: 1280,
  height: 704,
  hasAudio: true,
  ...overrides,
});

describe('TechnicalTextVideoVideoQc', () => {
  const qc = new TechnicalTextVideoVideoQc();
  const policyVersion = VIDEO_TECHNICAL_QC_POLICY_VERSION;
  const evaluate = (bytes: Buffer, artifact: StagedCascadeVideo, policy = policyVersion) =>
    qc.evaluate({
      runpodJobId: 'job-1',
      videoArtifactSha256: 'f'.repeat(64),
      artifact,
      mp4Bytes: bytes,
      motionPromptSha256: 'd'.repeat(64),
      policyVersion: policy,
    });

  it('is configured', () => {
    expect(qc.isConfigured()).toBe(true);
  });

  it('passes a plausible 10s mp4', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10.04, totalBytes: 300_000 });
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'pass',
      reasonCode: null,
    });
  });

  it('passes a version-1 mvhd 5s mp4', async () => {
    const bytes = syntheticMp4({
      durationSeconds: 5.04,
      totalBytes: 300_000,
      mvhdVersion: 1,
    });
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'pass',
    });
  });

  it('errors on unsupported policy version', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10, totalBytes: 300_000 });
    expect(
      await evaluate(bytes, stagedVideo(bytes), 'video-qc-disabled-v1'),
    ).toMatchObject({
      decision: 'error',
      reasonCode: 'VIDEO_QC_POLICY_UNSUPPORTED',
    });
  });

  it('errors on byte length mismatch with the staged artifact', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10, totalBytes: 300_000 });
    expect(
      await evaluate(bytes, stagedVideo(bytes, { byteLength: 299_999 })),
    ).toMatchObject({
      decision: 'error',
      reasonCode: 'VIDEO_QC_BYTE_LENGTH_MISMATCH',
    });
  });

  it('rejects an implausibly small artifact', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10, totalBytes: 50_000 });
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_TOO_SMALL',
    });
  });

  it('rejects bytes without an ftyp header', async () => {
    const bytes = Buffer.alloc(300_000);
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_NOT_MP4',
    });
  });

  it('rejects missing audio', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10, totalBytes: 300_000 });
    expect(
      await evaluate(bytes, stagedVideo(bytes, { hasAudio: false })),
    ).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_AUDIO_MISSING',
    });
  });

  it('rejects invalid dimensions', async () => {
    const bytes = syntheticMp4({ durationSeconds: 10, totalBytes: 300_000 });
    expect(
      await evaluate(bytes, stagedVideo(bytes, { width: 1270 })),
    ).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_DIMENSIONS_INVALID',
    });
  });

  it('rejects out-of-range duration', async () => {
    const bytes = syntheticMp4({ durationSeconds: 20, totalBytes: 300_000 });
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_DURATION_OUT_OF_RANGE',
    });
  });

  it('rejects when duration cannot be read', async () => {
    const bytes = syntheticMp4({ durationSeconds: null, totalBytes: 300_000 });
    expect(await evaluate(bytes, stagedVideo(bytes))).toMatchObject({
      decision: 'reject',
      reasonCode: 'VIDEO_QC_DURATION_UNREADABLE',
    });
  });
});

describe('readMvhdDurationSeconds', () => {
  it('reads v0 and v1 boxes and returns null without one', () => {
    expect(
      readMvhdDurationSeconds(
        syntheticMp4({ durationSeconds: 7.5, totalBytes: 4_096 }),
      ),
    ).toBeCloseTo(7.5, 2);
    expect(
      readMvhdDurationSeconds(
        syntheticMp4({
          durationSeconds: 9.25,
          totalBytes: 4_096,
          mvhdVersion: 1,
        }),
      ),
    ).toBeCloseTo(9.25, 2);
    expect(
      readMvhdDurationSeconds(
        syntheticMp4({ durationSeconds: null, totalBytes: 4_096 }),
      ),
    ).toBeNull();
  });
});
