import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { PrunaStillCanonicalizer } from './pruna-still-canonicalizer';

describe('PrunaStillCanonicalizer', () => {
  let landscapeJpeg: Buffer;
  let portraitJpeg: Buffer;
  let wrongDimensionJpeg: Buffer;
  let rotatedJpeg: Buffer;
  let orientationOneJpeg: Buffer;
  let cmykJpeg: Buffer;
  let blankJpeg: Buffer;
  let multiImageGif: Buffer;

  beforeAll(async () => {
    const landscapeRgb = createPatternRgb(1280, 704);
    const portraitRgb = createPatternRgb(704, 1280);
    landscapeJpeg = await encodeRgbJpeg(landscapeRgb, 1280, 704);
    portraitJpeg = await encodeRgbJpeg(portraitRgb, 704, 1280);
    wrongDimensionJpeg = await encodeRgbJpeg(
      createPatternRgb(1279, 704),
      1279,
      704,
    );
    rotatedJpeg = await sharp(landscapeRgb, {
      raw: { width: 1280, height: 704, channels: 3 },
    })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    orientationOneJpeg = await sharp(landscapeRgb, {
      raw: { width: 1280, height: 704, channels: 3 },
    })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .withMetadata({ orientation: 1 })
      .toBuffer();
    cmykJpeg = await sharp(landscapeRgb, {
      raw: { width: 1280, height: 704, channels: 3 },
    })
      .toColourspace('cmyk')
      .jpeg({ quality: 92 })
      .toBuffer();
    blankJpeg = await sharp({
      create: {
        width: 1280,
        height: 704,
        channels: 3,
        background: { r: 20, g: 30, b: 40 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();
    multiImageGif = await createTwoFrameGif();
  }, 30_000);

  it.each([
    ['landscape', 1280, 704, () => landscapeJpeg],
    ['portrait', 704, 1280, () => portraitJpeg],
  ] as const)(
    'creates a metadata-free non-paletted RGB PNG for %s',
    async (_, width, height, fixture) => {
      const source = fixture();
      const canonicalizer = new PrunaStillCanonicalizer();
      const result = await canonicalizer.canonicalize(source, {
        width,
        height,
      });
      const metadata = await sharp(result.canonicalPngBytes).metadata();
      const sourceRgb = await sharp(source, { failOn: 'error' })
        .raw({ depth: 'uchar' })
        .toBuffer();
      const canonicalRgb = await sharp(result.canonicalPngBytes, {
        failOn: 'error',
      })
        .raw({ depth: 'uchar' })
        .toBuffer();

      expect(result).toMatchObject({
        sourceMime: 'image/jpeg',
        sourceByteLength: source.byteLength,
        sourceSha256: sha256(source),
        canonicalMime: 'image/png',
        canonicalByteLength: result.canonicalPngBytes.byteLength,
        canonicalSha256: sha256(result.canonicalPngBytes),
        decodedRgbSha256: sha256(sourceRgb),
        width,
        height,
      });
      expect(metadata).toMatchObject({
        format: 'png',
        width,
        height,
        space: 'srgb',
        channels: 3,
        depth: 'uchar',
        hasAlpha: false,
        hasProfile: false,
      });
      expect(
        (metadata as sharp.Metadata & { paletteBitDepth?: number })
          .paletteBitDepth,
      ).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.comments).toBeUndefined();
      expect(pngChunkTypes(result.canonicalPngBytes)).toEqual([
        'IHDR',
        ...pngChunkTypes(result.canonicalPngBytes).filter(
          (type) => type === 'IDAT',
        ),
        'IEND',
      ]);
      expect(
        pngChunkTypes(result.canonicalPngBytes).every((type) =>
          ['IHDR', 'IDAT', 'IEND'].includes(type),
        ),
      ).toBe(true);
      expect(canonicalRgb.equals(sourceRgb)).toBe(true);
      expect(sha256(canonicalRgb)).toBe(result.decodedRgbSha256);
    },
  );

  it('accepts EXIF orientation 1 but strips all source metadata', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();

    const result = await canonicalizer.canonicalize(orientationOneJpeg, {
      width: 1280,
      height: 704,
    });
    const metadata = await sharp(result.canonicalPngBytes).metadata();

    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.hasProfile).toBe(false);
  });

  it('rejects a truncated JPEG without repair', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();
    const truncated = landscapeJpeg.subarray(0, landscapeJpeg.byteLength - 16);

    await expect(
      canonicalizer.canonicalize(truncated, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_INVALID',
      metadata: {
        stage: 'canonicalize',
        reasonCode: 'PRUNA_OUTPUT_INVALID',
        retryable: false,
      },
    });
  });

  it('rejects source bytes above the configured bound before decode', async () => {
    const canonicalizer = new PrunaStillCanonicalizer({
      maxSourceBytes: landscapeJpeg.byteLength - 1,
    });

    await expect(
      canonicalizer.canonicalize(landscapeJpeg, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_TOO_LARGE',
      metadata: { reasonCode: 'PRUNA_OUTPUT_TOO_LARGE' },
    });
  });

  it('rejects wrong dimensions without resize or crop', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();

    await expect(
      canonicalizer.canonicalize(wrongDimensionJpeg, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_DIMENSION_MISMATCH',
      metadata: { reasonCode: 'PRUNA_OUTPUT_DIMENSION_MISMATCH' },
    });
  });

  it('rejects rotated EXIF without auto-orienting', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();

    await expect(
      canonicalizer.canonicalize(rotatedJpeg, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_ROTATED',
      metadata: { reasonCode: 'PRUNA_OUTPUT_ROTATED' },
    });
  });

  it('rejects CMYK without colourspace conversion', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();

    await expect(
      canonicalizer.canonicalize(cmykJpeg, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_COLORSPACE_UNSUPPORTED',
      metadata: { reasonCode: 'PRUNA_OUTPUT_COLORSPACE_UNSUPPORTED' },
    });
  });

  it('rejects a spatially blank raster', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();

    await expect(
      canonicalizer.canonicalize(blankJpeg, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_BLANK',
      metadata: { reasonCode: 'PRUNA_OUTPUT_BLANK' },
    });
  });

  it('rejects a locally generated multi-image input', async () => {
    const metadata = await sharp(multiImageGif, {
      animated: true,
      pages: -1,
    }).metadata();
    expect(metadata.pages).toBe(2);
    const canonicalizer = new PrunaStillCanonicalizer();

    await expect(
      canonicalizer.canonicalize(multiImageGif, {
        width: 1280,
        height: 704,
      }),
    ).rejects.toMatchObject({
      message: 'PRUNA_OUTPUT_MULTI_IMAGE',
      metadata: { reasonCode: 'PRUNA_OUTPUT_MULTI_IMAGE' },
    });
  });

  it('keeps source bytes and image content out of errors', async () => {
    const canonicalizer = new PrunaStillCanonicalizer();
    const forbidden = Buffer.from(
      'raw-prompt api-key https://private.example/image.jpg raw-base64',
    );

    let caught: unknown;
    try {
      await canonicalizer.canonicalize(forbidden, {
        width: 1280,
        height: 704,
      });
    } catch (error) {
      caught = error;
    }

    const serialized = JSON.stringify(caught);
    expect(serialized).toContain('PRUNA_OUTPUT_INVALID');
    expect(serialized).not.toContain(forbidden.toString('utf8'));
    expect(serialized).not.toContain('raw-prompt');
    expect(serialized).not.toContain('api-key');
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('raw-base64');
  });
});

function createPatternRgb(width: number, height: number): Buffer {
  const bytes = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      bytes[offset] = Math.floor(x / 8) % 256;
      bytes[offset + 1] = Math.floor(y / 4) % 256;
      bytes[offset + 2] =
        ((Math.floor(x / 32) + Math.floor(y / 32)) * 17) % 256;
    }
  }
  return bytes;
}

function encodeRgbJpeg(
  rgb: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function createTwoFrameGif(): Promise<Buffer> {
  const frame = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 200, g: 10, b: 20 },
    },
  })
    .gif()
    .toBuffer();
  const packed = frame[10];
  const globalColourTableBytes =
    packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
  const framePayloadStart = 13 + globalColourTableBytes;
  const trailerIndex = frame.lastIndexOf(0x3b);
  const secondFrame = frame.subarray(framePayloadStart, trailerIndex);
  return Buffer.concat([
    frame.subarray(0, trailerIndex),
    secondFrame,
    Buffer.from([0x3b]),
  ]);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function pngChunkTypes(png: Buffer): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset + 12 <= png.byteLength) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    types.push(type);
    offset += 12 + length;
    if (type === 'IEND') {
      break;
    }
  }
  return types;
}
