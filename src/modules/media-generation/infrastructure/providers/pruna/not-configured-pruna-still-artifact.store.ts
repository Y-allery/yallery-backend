import { Injectable } from '@nestjs/common';
import {
  PrivateCanonicalPngWrite,
  PrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from './pruna-still-artifact.store';
import { PrunaPImageClientError } from './pruna-p-image.types';

/** Fail-closed placeholder for deployments that intentionally omit a store. */
@Injectable()
export class NotConfiguredPrunaStillArtifactStore
  implements PrunaStillArtifactStore
{
  isConfigured(): boolean {
    return false;
  }

  putCanonicalPng(
    _artifact: Readonly<PrivateCanonicalPngWrite>,
  ): Promise<void> {
    return Promise.reject(notConfiguredError());
  }

  readCanonicalPng(_ref: PrivateStillArtifactRef): Promise<Buffer> {
    return Promise.reject(notConfiguredError());
  }

  deleteCanonicalPng(_ref: PrivateStillArtifactRef): Promise<void> {
    return Promise.reject(notConfiguredError());
  }
}

function notConfiguredError(): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage: 'store',
    reasonCode: 'PRUNA_ARTIFACT_STORE_FAILED',
    retryable: false,
    certainty: 'not_accepted',
  });
}
