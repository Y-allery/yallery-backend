import { createHash } from 'crypto';
import { PrunaPImageClientError } from './pruna-p-image.types';

declare const privateStillArtifactRefBrand: unique symbol;

/**
 * Process-safe identifier for an object in a private checkpoint store. It is
 * intentionally not a URL and conveys no public-read capability.
 */
export type PrivateStillArtifactRef = string & {
  readonly [privateStillArtifactRefBrand]: true;
};

export interface PrivateCanonicalPngWrite {
  /**
   * Exact deterministic object reference chosen by the workflow adapter.
   * Implementations must create it once or adopt an existing object only when
   * all integrity metadata and bytes are identical. They must never overwrite
   * conflicting content at this reference.
   */
  privateArtifactRef: PrivateStillArtifactRef;
  bytes: Buffer;
  mime: 'image/png';
  byteLength: number;
  sha256: string;
  width: 704 | 1280;
  height: 704 | 1280;
}

/**
 * Implementations must be private, immutable and encrypted at rest. Public CDN
 * upload services do not implement this contract.
 */
export interface PrunaStillArtifactStore {
  isConfigured?(): boolean;

  putCanonicalPng(artifact: Readonly<PrivateCanonicalPngWrite>): Promise<void>;

  readCanonicalPng(ref: PrivateStillArtifactRef): Promise<Buffer>;

  deleteCanonicalPng(ref: PrivateStillArtifactRef): Promise<void>;
}

export function asPrivateStillArtifactRef(
  candidate: string,
): PrivateStillArtifactRef {
  if (
    typeof candidate !== 'string' ||
    !/^[A-Za-z0-9_-]{16,256}$/.test(candidate) ||
    candidate.includes('://')
  ) {
    throw new PrunaPImageClientError({
      stage: 'store',
      reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
      retryable: false,
      certainty: 'accepted',
    });
  }
  return candidate as PrivateStillArtifactRef;
}

/**
 * A provider prediction identifies one paid still. Keeping the canvas in the
 * preimage prevents accidental adoption under an incompatible materialization
 * contract while retaining the same key across process crashes and retries.
 */
export function deterministicPrivateStillArtifactRef(input: {
  predictionId: string;
  width: 704 | 1280;
  height: 704 | 1280;
}): PrivateStillArtifactRef {
  if (
    typeof input.predictionId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(input.predictionId)
  ) {
    throw new PrunaPImageClientError({
      stage: 'store',
      reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
      retryable: false,
      certainty: 'accepted',
    });
  }
  const digest = createHash('sha256')
    .update(
      `pruna_p_image\u0000${input.predictionId}\u0000${input.width}x${input.height}`,
    )
    .digest('hex');
  return asPrivateStillArtifactRef(`pruna_still_${digest}`);
}
