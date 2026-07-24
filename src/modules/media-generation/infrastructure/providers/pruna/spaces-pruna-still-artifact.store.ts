import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  PrivateStoredObject,
  SpacesStorageService,
} from 'src/modules/uploads/spaces-storage.service';
import {
  PrivateCanonicalPngWrite,
  PrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from './pruna-still-artifact.store';
import { PrunaPImageClientError } from './pruna-p-image.types';

const MAX_CANONICAL_PNG_BYTES = 6 * 1024 * 1024;
const PRIVATE_STILL_REF = /^pruna_still_([a-f0-9]{64})$/;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const CHECKPOINT_SCHEMA = 'ltx-pruna-still-v1';

/**
 * Private, immutable Pruna checkpoint adapter backed by the application's
 * existing DigitalOcean Spaces client. It returns only an opaque reference;
 * no bucket/CDN URL or public-read object is ever created.
 */
@Injectable()
export class SpacesPrunaStillArtifactStore implements PrunaStillArtifactStore {
  constructor(private readonly spaces: SpacesStorageService) {}

  isConfigured(): boolean {
    return this.spaces.isConfigured();
  }

  async putCanonicalPng(
    artifact: Readonly<PrivateCanonicalPngWrite>,
  ): Promise<void> {
    try {
      assertCanonicalWrite(artifact);
      await this.spaces.putPrivateImmutableObjectOnce({
        key: objectKey(artifact.privateArtifactRef),
        body: artifact.bytes,
        contentType: artifact.mime,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
        metadata: checkpointMetadata(artifact),
        maxBytes: MAX_CANONICAL_PNG_BYTES,
      });
    } catch {
      throw storeError();
    }
  }

  async readCanonicalPng(ref: PrivateStillArtifactRef): Promise<Buffer> {
    let stored: PrivateStoredObject | null = null;
    try {
      const normalizedRef = assertPrivateStillRef(ref);
      stored = await this.spaces.readPrivateImmutableObject(
        objectKey(normalizedRef),
        MAX_CANONICAL_PNG_BYTES,
      );
      assertStoredCheckpoint(stored, normalizedRef);
      return Buffer.from(stored.body);
    } catch {
      throw storeError();
    } finally {
      stored?.body.fill(0);
    }
  }

  async deleteCanonicalPng(ref: PrivateStillArtifactRef): Promise<void> {
    try {
      await this.spaces.deletePrivateImmutableObject(
        objectKey(assertPrivateStillRef(ref)),
      );
    } catch {
      throw storeError();
    }
  }
}

function objectKey(ref: PrivateStillArtifactRef): string {
  const match = PRIVATE_STILL_REF.exec(ref);
  if (!match) {
    throw storeError();
  }
  return `private/ltx-cascade/stills/${match[1]}.png`;
}

function checkpointMetadata(
  artifact: Readonly<PrivateCanonicalPngWrite>,
): Readonly<Record<string, string>> {
  return Object.freeze({
    schema: CHECKPOINT_SCHEMA,
    artifactref: artifact.privateArtifactRef,
    sha256: artifact.sha256,
    bytelength: String(artifact.byteLength),
    width: String(artifact.width),
    height: String(artifact.height),
  });
}

function assertCanonicalWrite(
  artifact: Readonly<PrivateCanonicalPngWrite>,
): void {
  const ref = assertPrivateStillRef(artifact?.privateArtifactRef);
  const exactCanvas =
    (artifact?.width === 1280 && artifact?.height === 704) ||
    (artifact?.width === 704 && artifact?.height === 1280);
  if (
    ref !== artifact.privateArtifactRef ||
    !Buffer.isBuffer(artifact.bytes) ||
    artifact.mime !== 'image/png' ||
    !Number.isSafeInteger(artifact.byteLength) ||
    artifact.byteLength <= 0 ||
    artifact.byteLength > MAX_CANONICAL_PNG_BYTES ||
    artifact.bytes.byteLength !== artifact.byteLength ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    sha256(artifact.bytes) !== artifact.sha256 ||
    !exactCanvas
  ) {
    throw storeError();
  }
  assertCanonicalPngEnvelope(artifact.bytes, artifact.width, artifact.height);
}

function assertStoredCheckpoint(
  stored: Readonly<PrivateStoredObject>,
  ref: PrivateStillArtifactRef,
): void {
  const metadata = stored.metadata;
  const exactMetadataKeys = [
    'artifactref',
    'bytelength',
    'height',
    'schema',
    'sha256',
    'width',
  ];
  const byteLength = parseSafeInteger(metadata.bytelength);
  const width = parseSafeInteger(metadata.width);
  const height = parseSafeInteger(metadata.height);
  const exactCanvas =
    (width === 1280 && height === 704) || (width === 704 && height === 1280);
  if (
    stored.contentType !== 'image/png' ||
    stored.cacheControl !== PRIVATE_CACHE_CONTROL ||
    Object.keys(metadata).sort().join(',') !==
      exactMetadataKeys.sort().join(',') ||
    metadata.schema !== CHECKPOINT_SCHEMA ||
    metadata.artifactref !== ref ||
    !/^[a-f0-9]{64}$/.test(metadata.sha256 ?? '') ||
    byteLength === null ||
    byteLength <= 0 ||
    byteLength > MAX_CANONICAL_PNG_BYTES ||
    stored.contentLength !== byteLength ||
    stored.body.byteLength !== byteLength ||
    sha256(stored.body) !== metadata.sha256 ||
    !exactCanvas
  ) {
    throw storeError();
  }
  assertCanonicalPngEnvelope(stored.body, width, height);
}

function assertCanonicalPngEnvelope(
  bytes: Buffer,
  width: number,
  height: number,
): void {
  if (
    bytes.byteLength < 45 ||
    !bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR' ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height ||
    bytes[24] !== 8 ||
    bytes[25] !== 2 ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] !== 0 ||
    !bytes.subarray(-PNG_IEND.byteLength).equals(PNG_IEND)
  ) {
    throw storeError();
  }
}

function assertPrivateStillRef(
  ref: PrivateStillArtifactRef,
): PrivateStillArtifactRef {
  if (typeof ref !== 'string' || !PRIVATE_STILL_REF.test(ref)) {
    throw storeError();
  }
  return ref;
}

function parseSafeInteger(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function storeError(): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage: 'store',
    reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
    retryable: false,
    certainty: 'accepted',
  });
}
