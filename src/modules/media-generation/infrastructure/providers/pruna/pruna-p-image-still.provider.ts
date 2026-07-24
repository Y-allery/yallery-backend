import { createHash } from 'crypto';
import { PrunaPImageClient } from './pruna-p-image.client';
import {
  PrunaPImageClientError,
  PrunaPImageGenerationInput,
  PrunaPredictionStatus,
  PrunaStillSubmission,
} from './pruna-p-image.types';
import {
  CanonicalizedPrunaStill,
  PrunaStillCanonicalizer,
  PrunaStillCanvas,
} from './pruna-still-canonicalizer';
import {
  asPrivateStillArtifactRef,
  deterministicPrivateStillArtifactRef,
  PrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from './pruna-still-artifact.store';

interface PrunaPImageClientPort {
  submit(
    input: PrunaPImageGenerationInput,
    expectedPolicySha256: string,
  ): Promise<PrunaStillSubmission>;
  getStatus(
    predictionId: string,
    expectedPolicySha256: string,
  ): Promise<PrunaPredictionStatus>;
  downloadSucceededJpeg(
    predictionId: string,
    expectedPolicySha256: string,
  ): ReturnType<PrunaPImageClient['downloadSucceededJpeg']>;
}

export interface PrunaStillMaterializationRequest extends PrunaStillCanvas {
  predictionId: string;
}

export interface CanonicalPrunaStillArtifact {
  privateArtifactRef: PrivateStillArtifactRef;
  sourceMime: 'image/jpeg';
  sourceByteLength: number;
  sourceSha256: string;
  canonicalMime: 'image/png';
  canonicalByteLength: number;
  canonicalSha256: string;
  decodedRgbSha256: string;
  width: 704 | 1280;
  height: 704 | 1280;
}

export interface MaterializedPrunaStillArtifact
  extends CanonicalPrunaStillArtifact {
  downloadDurationMs: number;
  canonicalizeDurationMs: number;
}

/**
 * Internal workflow-only P-Image still provider. It is intentionally separate
 * from the public MediaGenerationProvider registry.
 */
export class PrunaPImageStillProvider {
  constructor(
    private readonly client: PrunaPImageClientPort,
    private readonly canonicalizer: PrunaStillCanonicalizer,
    private readonly artifactStore: PrunaStillArtifactStore,
  ) {}

  submit(
    input: PrunaPImageGenerationInput,
    expectedPolicySha256: string,
  ): Promise<PrunaStillSubmission> {
    return this.client.submit(input, expectedPolicySha256);
  }

  getStatus(
    predictionId: string,
    expectedPolicySha256: string,
  ): Promise<PrunaPredictionStatus> {
    return this.client.getStatus(predictionId, expectedPolicySha256);
  }

  async materialize(
    request: Readonly<PrunaStillMaterializationRequest>,
    expectedPolicySha256: string,
  ): Promise<MaterializedPrunaStillArtifact> {
    const downloadStartedAt = Date.now();
    const downloaded = await this.client.downloadSucceededJpeg(
      request.predictionId,
      expectedPolicySha256,
    );
    const downloadDurationMs = boundedDurationSince(downloadStartedAt);
    let canonical: CanonicalizedPrunaStill;
    const canonicalizeStartedAt = Date.now();
    try {
      canonical = await this.canonicalizer.canonicalize(downloaded.bytes, {
        width: request.width,
        height: request.height,
      });
    } finally {
      // The source JPEG is never persisted and is explicitly cleared once the
      // one permitted source decode finishes (or fails).
      downloaded.bytes.fill(0);
    }
    const canonicalizeDurationMs = boundedDurationSince(canonicalizeStartedAt);

    if (
      canonical.sourceMime !== downloaded.mime ||
      canonical.sourceByteLength !== downloaded.byteLength ||
      canonical.sourceSha256 !== downloaded.sha256
    ) {
      throw artifactError('artifact_read', 'PRUNA_ARTIFACT_INTEGRITY_FAILED');
    }

    const privateArtifactRef = deterministicPrivateStillArtifactRef(request);
    try {
      await this.artifactStore.putCanonicalPng({
        privateArtifactRef,
        bytes: Buffer.from(canonical.canonicalPngBytes),
        mime: canonical.canonicalMime,
        byteLength: canonical.canonicalByteLength,
        sha256: canonical.canonicalSha256,
        width: canonical.width,
        height: canonical.height,
      });
    } catch {
      throw artifactError('store', 'PRUNA_ARTIFACT_STORE_FAILED');
    }

    try {
      const readBack =
        await this.artifactStore.readCanonicalPng(privateArtifactRef);
      if (
        !Buffer.isBuffer(readBack) ||
        readBack.byteLength !== canonical.canonicalByteLength ||
        sha256(readBack) !== canonical.canonicalSha256 ||
        !readBack.equals(canonical.canonicalPngBytes)
      ) {
        throw new Error();
      }
    } catch {
      await this.deleteBestEffort(privateArtifactRef);
      throw artifactError('artifact_read', 'PRUNA_ARTIFACT_INTEGRITY_FAILED');
    }

    return {
      privateArtifactRef,
      sourceMime: canonical.sourceMime,
      sourceByteLength: canonical.sourceByteLength,
      sourceSha256: canonical.sourceSha256,
      canonicalMime: canonical.canonicalMime,
      canonicalByteLength: canonical.canonicalByteLength,
      canonicalSha256: canonical.canonicalSha256,
      decodedRgbSha256: canonical.decodedRgbSha256,
      width: canonical.width,
      height: canonical.height,
      downloadDurationMs,
      canonicalizeDurationMs,
    };
  }

  /**
   * Both still QC and LTX call this method with the same immutable descriptor.
   * Every read is length/hash-verified before canonical bytes leave the store.
   */
  async loadCanonicalBytes(
    artifact: Readonly<CanonicalPrunaStillArtifact>,
  ): Promise<Buffer> {
    let ref: PrivateStillArtifactRef;
    try {
      ref = asPrivateStillArtifactRef(artifact.privateArtifactRef);
    } catch {
      throw artifactError('artifact_read', 'PRUNA_ARTIFACT_INTEGRITY_FAILED');
    }

    let bytes: Buffer;
    try {
      bytes = await this.artifactStore.readCanonicalPng(ref);
    } catch {
      throw artifactError('artifact_read', 'PRUNA_ARTIFACT_STORE_FAILED');
    }
    if (
      !Buffer.isBuffer(bytes) ||
      artifact.canonicalMime !== 'image/png' ||
      bytes.byteLength !== artifact.canonicalByteLength ||
      sha256(bytes) !== artifact.canonicalSha256
    ) {
      throw artifactError('artifact_read', 'PRUNA_ARTIFACT_INTEGRITY_FAILED');
    }
    return Buffer.from(bytes);
  }

  private async deleteBestEffort(ref: PrivateStillArtifactRef): Promise<void> {
    try {
      await this.artifactStore.deleteCanonicalPng(ref);
    } catch {
      // Deliberately suppressed: the caller receives one bounded integrity
      // error and no store implementation details.
    }
  }
}

function artifactError(
  stage: 'store' | 'artifact_read',
  reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED' | 'PRUNA_ARTIFACT_INTEGRITY_FAILED',
): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage,
    reasonCode,
    retryable: false,
    certainty: 'accepted',
  });
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedDurationSince(startedAt: number): number {
  return Math.max(0, Math.min(4_294_967_295, Date.now() - startedAt));
}
