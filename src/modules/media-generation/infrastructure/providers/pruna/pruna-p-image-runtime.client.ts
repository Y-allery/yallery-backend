import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { TextVideoCascadeRuntimeConfigService } from 'src/modules/media-generation/application/text-video/text-video-cascade-runtime-config.service';
import {
  PrunaPImageClient,
  prunaPImageClientPolicySha256,
} from './pruna-p-image.client';
import {
  PrunaPImageClientConfig,
  PrunaPImageClientError,
  PrunaPImageGenerationInput,
  PrunaPredictionStatus,
  PrunaStillSubmission,
} from './pruna-p-image.types';

/**
 * Lazy runtime adapter. Missing/disabled Pruna settings never prevent Nest
 * startup and are never read unless the readiness-gated cascade calls it.
 */
@Injectable()
export class PrunaPImageRuntimeClient {
  private cached:
    | {
        fingerprint: string;
        client: PrunaPImageClient;
      }
    | undefined;

  constructor(
    private readonly runtimeConfig: TextVideoCascadeRuntimeConfigService,
  ) {}

  async submit(
    input: PrunaPImageGenerationInput,
    expectedPolicySha256: string,
  ): Promise<PrunaStillSubmission> {
    return (
      await this.getClient(expectedPolicySha256, 'submit', 'not_accepted')
    ).submit(input);
  }

  async getStatus(
    predictionId: string,
    expectedPolicySha256: string,
  ): Promise<PrunaPredictionStatus> {
    return (
      await this.getClient(expectedPolicySha256, 'status', 'accepted')
    ).getStatus(predictionId);
  }

  async downloadSucceededJpeg(
    predictionId: string,
    expectedPolicySha256: string,
  ) {
    return (
      await this.getClient(expectedPolicySha256, 'download', 'accepted')
    ).downloadSucceededJpeg(predictionId);
  }

  private async getClient(
    expectedPolicySha256: string,
    stage: 'submit' | 'status' | 'download',
    certainty: 'not_accepted' | 'accepted',
  ): Promise<PrunaPImageClient> {
    if (!/^[a-f0-9]{64}$/.test(expectedPolicySha256)) {
      throw policyDriftError(stage, certainty);
    }
    const config = await this.runtimeConfig.getPrunaClientConfig();
    const actualPolicySha256 = prunaPImageClientPolicySha256(config);
    if (actualPolicySha256 !== expectedPolicySha256) {
      throw policyDriftError(stage, certainty);
    }
    const fingerprint = createHash('sha256')
      .update(
        `${actualPolicySha256}\n${createHash('sha256')
          .update(config.apiKey)
          .digest('hex')}`,
      )
      .digest('hex');
    if (this.cached?.fingerprint === fingerprint) {
      return this.cached.client;
    }
    const client = this.createClient(config);
    this.cached = { fingerprint, client };
    return client;
  }

  protected createClient(config: PrunaPImageClientConfig): PrunaPImageClient {
    return new PrunaPImageClient(config);
  }
}

function policyDriftError(
  stage: 'submit' | 'status' | 'download',
  certainty: 'not_accepted' | 'accepted',
): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage,
    reasonCode: 'PRUNA_CLIENT_POLICY_DRIFT',
    retryable: false,
    certainty,
  });
}
