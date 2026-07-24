import { Injectable } from '@nestjs/common';

export const CASCADE_LTX_I2V_REQUEST_MAX_BYTES = 9 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IHDR_LENGTH = 13;
const PNG_IHDR_TYPE = 'IHDR';
const PNG_BIT_DEPTH = 8;
const PNG_TRUECOLOUR_TYPE = 2;
const MAX_PROMPT_UTF8_BYTES = 32 * 1024;
const MAX_CANONICAL_PNG_BYTES = 6 * 1024 * 1024;
const PNG_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export interface CascadeLtxI2VPayloadRequest {
  prompt: string;
  canonicalPng: Buffer | string;
  width: 704 | 1280;
  height: 704 | 1280;
  frames: 121 | 241;
  seed: number;
  maxSerializedRequestBytes?: number;
}

export interface CascadeLtxI2VPayload {
  prompt: string;
  image_b64: string;
  width: 704 | 1280;
  height: 704 | 1280;
  frames: 121 | 241;
  fps: 24;
  audio: true;
  tier: 'quality';
  seed: number;
  cas_amount: 0;
  enhance: false;
}

@Injectable()
export class CascadeLtxI2VPayloadBuilder {
  build(request: Readonly<CascadeLtxI2VPayloadRequest>): CascadeLtxI2VPayload {
    return buildCascadeLtxI2VPayload(request);
  }
}

export class CascadeLtxI2VPayloadError extends Error {
  constructor(
    readonly reasonCode:
      | 'LTX_CASCADE_PAYLOAD_INVALID'
      | 'LTX_CASCADE_PAYLOAD_TOO_LARGE',
  ) {
    super(reasonCode);
    this.name = 'CascadeLtxI2VPayloadError';
  }

  toJSON(): { reasonCode: string } {
    return { reasonCode: this.reasonCode };
  }
}

/**
 * Pure builder for trusted canonical checkpoint bytes. It does not download,
 * transform, resize or re-encode the still.
 */
export function buildCascadeLtxI2VPayload(
  request: Readonly<CascadeLtxI2VPayloadRequest>,
): CascadeLtxI2VPayload {
  validateRequest(request);
  const requestCap =
    request.maxSerializedRequestBytes ?? CASCADE_LTX_I2V_REQUEST_MAX_BYTES;
  const imageBytes = decodeCanonicalPng(request.canonicalPng);
  validateCanonicalPngHeader(imageBytes, request.width, request.height);
  const imageBase64 = imageBytes.toString('base64');

  const payload: CascadeLtxI2VPayload = {
    prompt: request.prompt,
    image_b64: imageBase64,
    width: request.width,
    height: request.height,
    frames: request.frames,
    fps: 24,
    audio: true,
    tier: 'quality',
    seed: request.seed,
    cas_amount: 0,
    enhance: false,
  };

  const serializedBytes = Buffer.byteLength(
    JSON.stringify({ input: payload }),
    'utf8',
  );
  if (serializedBytes > requestCap) {
    throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_TOO_LARGE');
  }
  return payload;
}

function validateRequest(request: Readonly<CascadeLtxI2VPayloadRequest>): void {
  const exactCanvas =
    (request?.width === 1280 && request?.height === 704) ||
    (request?.width === 704 && request?.height === 1280);
  if (
    !request ||
    typeof request.prompt !== 'string' ||
    request.prompt.length === 0 ||
    request.prompt !== request.prompt.trim() ||
    Buffer.byteLength(request.prompt, 'utf8') > MAX_PROMPT_UTF8_BYTES ||
    !exactCanvas ||
    (request.frames !== 121 && request.frames !== 241) ||
    !Number.isSafeInteger(request.seed) ||
    request.seed < 0 ||
    request.seed > 4_294_967_295 ||
    (request.maxSerializedRequestBytes !== undefined &&
      (!Number.isSafeInteger(request.maxSerializedRequestBytes) ||
        request.maxSerializedRequestBytes <= 0 ||
        request.maxSerializedRequestBytes > CASCADE_LTX_I2V_REQUEST_MAX_BYTES))
  ) {
    throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_INVALID');
  }
}

function decodeCanonicalPng(candidate: Buffer | string): Buffer {
  if (Buffer.isBuffer(candidate)) {
    if (candidate.byteLength > MAX_CANONICAL_PNG_BYTES) {
      throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_TOO_LARGE');
    }
    return Buffer.from(candidate);
  }
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > Math.ceil(MAX_CANONICAL_PNG_BYTES / 3) * 4 ||
    candidate.startsWith('data:') ||
    candidate.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(candidate)
  ) {
    throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_INVALID');
  }
  const decoded = Buffer.from(candidate, 'base64');
  if (decoded.toString('base64') !== candidate) {
    throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_INVALID');
  }
  return decoded;
}

function validateCanonicalPngHeader(
  bytes: Buffer,
  expectedWidth: number,
  expectedHeight: number,
): void {
  if (
    bytes.byteLength < 33 ||
    !bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== PNG_IHDR_LENGTH ||
    bytes.subarray(12, 16).toString('ascii') !== PNG_IHDR_TYPE ||
    bytes.readUInt32BE(16) !== expectedWidth ||
    bytes.readUInt32BE(20) !== expectedHeight ||
    bytes[24] !== PNG_BIT_DEPTH ||
    bytes[25] !== PNG_TRUECOLOUR_TYPE ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] !== 0 ||
    !bytes.subarray(-PNG_IEND.byteLength).equals(PNG_IEND)
  ) {
    throw new CascadeLtxI2VPayloadError('LTX_CASCADE_PAYLOAD_INVALID');
  }
}
