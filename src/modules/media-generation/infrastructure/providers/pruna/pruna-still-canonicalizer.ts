import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { PrunaPImageClientError, PrunaReasonCode } from './pruna-p-image.types';

const DEFAULT_MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const MAX_CONFIGURED_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_CANONICAL_PNG_BYTES = 6 * 1024 * 1024;
const MAX_INPUT_PIXELS = 1280 * 1280;
const EXPECTED_RGB_CHANNELS = 3;
const MAX_BLANK_CHANNEL_RANGE = 1;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface PrunaStillCanvas {
  width: 704 | 1280;
  height: 704 | 1280;
}

export interface CanonicalizedPrunaStill {
  sourceMime: 'image/jpeg';
  sourceByteLength: number;
  sourceSha256: string;
  canonicalMime: 'image/png';
  canonicalByteLength: number;
  canonicalSha256: string;
  decodedRgbSha256: string;
  width: 704 | 1280;
  height: 704 | 1280;
  canonicalPngBytes: Buffer;
}

export interface PrunaStillCanonicalizerConfig {
  maxSourceBytes?: number;
}

interface ExtendedSharpMetadata extends sharp.Metadata {
  // Sharp exposes this at runtime but omitted it from the 0.33.5 Metadata
  // declaration bundled in this repository.
  paletteBitDepth?: number;
}

/**
 * Strict JPEG checkpoint canonicalizer.
 *
 * metadata() reads headers without decoding compressed pixels. Only after all
 * format/dimension/orientation/colour checks pass is the JPEG decoded once to
 * raw RGB. The PNG encoder consumes those raw bytes, so no resize, crop,
 * rotation, enhancement or second lossy generation can occur.
 */
export class PrunaStillCanonicalizer {
  private readonly maxSourceBytes: number;

  constructor(config: PrunaStillCanonicalizerConfig = {}) {
    const requestedMax =
      config.maxSourceBytes === undefined
        ? DEFAULT_MAX_SOURCE_BYTES
        : config.maxSourceBytes;
    if (
      !Number.isSafeInteger(requestedMax) ||
      requestedMax <= 0 ||
      requestedMax > MAX_CONFIGURED_SOURCE_BYTES
    ) {
      throw canonicalError('PRUNA_CANONICALIZATION_FAILED');
    }
    this.maxSourceBytes = requestedMax;
  }

  async canonicalize(
    sourceJpegBytes: Buffer,
    expectedCanvas: Readonly<PrunaStillCanvas>,
  ): Promise<CanonicalizedPrunaStill> {
    validateCanvas(expectedCanvas);
    if (!Buffer.isBuffer(sourceJpegBytes) || sourceJpegBytes.byteLength === 0) {
      throw canonicalError('PRUNA_OUTPUT_INVALID');
    }
    if (sourceJpegBytes.byteLength > this.maxSourceBytes) {
      throw canonicalError('PRUNA_OUTPUT_TOO_LARGE');
    }

    const decoder = sharp(sourceJpegBytes, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    let metadata: sharp.Metadata;
    try {
      // Header-only: Sharp explicitly documents that metadata() does not
      // decode compressed pixel data.
      metadata = await decoder.metadata();
    } catch {
      throw canonicalError('PRUNA_OUTPUT_INVALID');
    }

    if ((metadata.pages ?? 1) !== 1) {
      throw canonicalError('PRUNA_OUTPUT_MULTI_IMAGE');
    }
    if (
      metadata.format !== 'jpeg' ||
      metadata.size !== sourceJpegBytes.byteLength ||
      !isCompleteJpeg(sourceJpegBytes)
    ) {
      throw canonicalError('PRUNA_OUTPUT_INVALID');
    }
    if (metadata.orientation !== undefined && metadata.orientation !== 1) {
      throw canonicalError('PRUNA_OUTPUT_ROTATED');
    }
    if (
      metadata.width !== expectedCanvas.width ||
      metadata.height !== expectedCanvas.height
    ) {
      throw canonicalError('PRUNA_OUTPUT_DIMENSION_MISMATCH');
    }
    if (
      metadata.space !== 'srgb' ||
      metadata.channels !== EXPECTED_RGB_CHANNELS ||
      metadata.depth !== 'uchar' ||
      metadata.hasAlpha === true
    ) {
      throw canonicalError('PRUNA_OUTPUT_COLORSPACE_UNSUPPORTED');
    }

    let decodedRgb: Buffer;
    try {
      const decoded = await decoder
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      if (
        decoded.info.width !== expectedCanvas.width ||
        decoded.info.height !== expectedCanvas.height ||
        decoded.info.channels !== EXPECTED_RGB_CHANNELS ||
        decoded.data.byteLength !==
          expectedCanvas.width * expectedCanvas.height * EXPECTED_RGB_CHANNELS
      ) {
        throw new Error();
      }
      decodedRgb = decoded.data;
    } catch {
      throw canonicalError('PRUNA_OUTPUT_INVALID');
    }

    if (isBlankRgb(decodedRgb)) {
      throw canonicalError('PRUNA_OUTPUT_BLANK');
    }

    let canonicalPngBytes: Buffer;
    try {
      const encoded = await sharp(decodedRgb, {
        raw: {
          width: expectedCanvas.width,
          height: expectedCanvas.height,
          channels: EXPECTED_RGB_CHANNELS,
        },
      })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: false,
          palette: false,
          force: true,
        })
        .toBuffer({ resolveWithObject: true });
      if (
        encoded.info.format !== 'png' ||
        encoded.info.width !== expectedCanvas.width ||
        encoded.info.height !== expectedCanvas.height ||
        encoded.info.channels !== EXPECTED_RGB_CHANNELS ||
        encoded.data.byteLength === 0 ||
        encoded.data.byteLength > MAX_CANONICAL_PNG_BYTES
      ) {
        throw new Error();
      }
      canonicalPngBytes = stripPngAncillaryChunks(encoded.data);
      if (
        canonicalPngBytes.byteLength === 0 ||
        canonicalPngBytes.byteLength > MAX_CANONICAL_PNG_BYTES
      ) {
        throw new Error();
      }
    } catch {
      throw canonicalError('PRUNA_CANONICALIZATION_FAILED');
    }

    await assertCanonicalPngRoundTrip(
      canonicalPngBytes,
      decodedRgb,
      expectedCanvas,
    );

    return {
      sourceMime: 'image/jpeg',
      sourceByteLength: sourceJpegBytes.byteLength,
      sourceSha256: sha256(sourceJpegBytes),
      canonicalMime: 'image/png',
      canonicalByteLength: canonicalPngBytes.byteLength,
      canonicalSha256: sha256(canonicalPngBytes),
      decodedRgbSha256: sha256(decodedRgb),
      width: expectedCanvas.width,
      height: expectedCanvas.height,
      canonicalPngBytes,
    };
  }
}

async function assertCanonicalPngRoundTrip(
  canonicalPngBytes: Buffer,
  expectedRgb: Buffer,
  canvas: Readonly<PrunaStillCanvas>,
): Promise<void> {
  try {
    const roundTripDecoder = sharp(canonicalPngBytes, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata =
      (await roundTripDecoder.metadata()) as ExtendedSharpMetadata;
    if (
      metadata.format !== 'png' ||
      metadata.width !== canvas.width ||
      metadata.height !== canvas.height ||
      metadata.space !== 'srgb' ||
      metadata.channels !== EXPECTED_RGB_CHANNELS ||
      metadata.depth !== 'uchar' ||
      metadata.hasAlpha !== false ||
      metadata.hasProfile !== false ||
      metadata.orientation !== undefined ||
      metadata.pages !== undefined ||
      metadata.paletteBitDepth !== undefined ||
      metadata.resolutionUnit !== undefined ||
      metadata.exif !== undefined ||
      metadata.icc !== undefined ||
      metadata.iptc !== undefined ||
      metadata.xmp !== undefined ||
      metadata.comments !== undefined ||
      metadata.background !== undefined
    ) {
      throw new Error();
    }

    const roundTrip = await roundTripDecoder
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    if (
      roundTrip.info.width !== canvas.width ||
      roundTrip.info.height !== canvas.height ||
      roundTrip.info.channels !== EXPECTED_RGB_CHANNELS ||
      !roundTrip.data.equals(expectedRgb)
    ) {
      throw new Error();
    }
  } catch {
    throw canonicalError('PRUNA_CANONICALIZATION_FAILED');
  }
}

function validateCanvas(canvas: Readonly<PrunaStillCanvas>): void {
  if (
    !canvas ||
    !(
      (canvas.width === 1280 && canvas.height === 704) ||
      (canvas.width === 704 && canvas.height === 1280)
    )
  ) {
    throw canonicalError('PRUNA_OUTPUT_DIMENSION_MISMATCH');
  }
}

function isCompleteJpeg(bytes: Buffer): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.byteLength - 2] === 0xff &&
    bytes[bytes.byteLength - 1] === 0xd9
  );
}

function isBlankRgb(rgb: Buffer): boolean {
  const minimum = [255, 255, 255];
  const maximum = [0, 0, 0];
  for (let index = 0; index < rgb.byteLength; index += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgb[index + channel];
      if (value < minimum[channel]) {
        minimum[channel] = value;
      }
      if (value > maximum[channel]) {
        maximum[channel] = value;
      }
    }
  }
  return maximum.every(
    (value, channel) => value - minimum[channel] <= MAX_BLANK_CHANNEL_RANGE,
  );
}

/**
 * libvips writes a default pHYs chunk even when no source metadata is copied.
 * Canonical checkpoints retain only the three required PNG chunk families;
 * removing ancillary chunks does not touch compressed pixel data or CRCs.
 */
function stripPngAncillaryChunks(png: Buffer): Buffer {
  if (
    png.byteLength < PNG_SIGNATURE.byteLength + 12 ||
    !png.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
  ) {
    throw new Error();
  }

  const retained: Buffer[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.byteLength;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;

  while (offset + 12 <= png.byteLength) {
    const dataLength = png.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > png.byteLength) {
      throw new Error();
    }
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = png.subarray(offset, chunkEnd);

    if (type === 'IHDR') {
      if (sawHeader || sawImageData || dataLength !== 13) {
        throw new Error();
      }
      sawHeader = true;
      retained.push(chunk);
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd) {
        throw new Error();
      }
      sawImageData = true;
      retained.push(chunk);
    } else if (type === 'IEND') {
      if (!sawHeader || !sawImageData || sawEnd || dataLength !== 0) {
        throw new Error();
      }
      sawEnd = true;
      retained.push(chunk);
    } else if (/^[A-Z]/.test(type)) {
      // A non-IHDR/IDAT/IEND critical chunk is not part of the canonical
      // truecolour encoding (notably PLTE).
      throw new Error();
    }

    offset = chunkEnd;
    if (sawEnd) {
      break;
    }
  }

  if (!sawHeader || !sawImageData || !sawEnd || offset !== png.byteLength) {
    throw new Error();
  }
  return Buffer.concat(retained);
}

function canonicalError(reasonCode: PrunaReasonCode): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage: 'canonicalize',
    reasonCode,
    retryable: false,
    certainty: 'accepted',
  });
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
