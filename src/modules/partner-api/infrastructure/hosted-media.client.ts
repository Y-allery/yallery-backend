import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

export interface HostedGenerationResult {
  url: string;
  executionMs: number;
}

export class HostedGenerationError extends Error {
  constructor(
    message: string,
    readonly stage: 'submit' | 'poll' | 'output',
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'HostedGenerationError';
  }
}

const SUBMIT_PATH = '/v1/predictions';
const STATUS_PATH = '/v1/predictions/status/';
const DEFAULT_BASE_URL = 'https://api.pruna.ai';
const POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Talks to the hosted generation provider for any of its models.
 *
 * Deliberately generic where the existing p-image client is not: that one hard-codes a
 * single model and validates one exact input shape, because it guards the cascade's
 * still stage. This one carries whatever input a partner model needs, so the catalog can
 * point at a new upstream model without a code change.
 *
 * Nothing about the upstream — its name, its errors, its URLs — is allowed to reach the
 * partner; callers translate failures into their own vocabulary.
 */
@Injectable()
export class HostedMediaClient {
  private readonly logger = new Logger(HostedMediaClient.name);

  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  private async credentials(): Promise<{ baseUrl: string; apiKey: string }> {
    const apiKey =
      await this.providerRuntimeConfigService.getString('PRUNA_API_KEY');
    if (!apiKey) {
      throw new HostedGenerationError(
        'Hosted backend is not configured',
        'submit',
      );
    }
    const baseUrl =
      (await this.providerRuntimeConfigService.getString(
        'PRUNA_API_BASE_URL',
      )) || DEFAULT_BASE_URL;
    return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
  }

  async generate(
    model: string,
    input: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<HostedGenerationResult> {
    const { baseUrl, apiKey } = await this.credentials();
    const startedAt = Date.now();

    // The model travels in a header, not the body — an easy detail to lose in a refactor
    // and the upstream answers 400 with a full model list when it is missing.
    const submitted = await axios
      .post(
        `${baseUrl}${SUBMIT_PATH}`,
        { input },
        {
          headers: { apikey: apiKey, Model: model },
          timeout: 60_000,
          validateStatus: () => true,
        },
      )
      .catch((error) => {
        throw new HostedGenerationError(
          `submit failed: ${error.code ?? error.message}`,
          'submit',
        );
      });

    if (submitted.status >= 400 || !submitted.data?.id) {
      throw new HostedGenerationError(
        `submit rejected: ${JSON.stringify(submitted.data).slice(0, 200)}`,
        'submit',
        submitted.status,
      );
    }

    const id = submitted.data.id as string;

    for (;;) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new HostedGenerationError('generation timed out', 'poll');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = await axios
        .get(`${baseUrl}${STATUS_PATH}${id}`, {
          headers: { apikey: apiKey },
          timeout: 30_000,
          validateStatus: () => true,
        })
        .catch((error) => {
          throw new HostedGenerationError(
            `status failed: ${error.code ?? error.message}`,
            'poll',
          );
        });

      const state = String(status.data?.status ?? '').toLowerCase();
      if (state === 'succeeded') {
        // Some models answer with a single url, the newer ones with a list of them. We ask
        // for one output either way, so the first entry is the whole result.
        const delivered = status.data?.generation_url;
        const url = Array.isArray(delivered) ? delivered[0] : delivered;
        if (typeof url !== 'string' || !url) {
          throw new HostedGenerationError(
            'upstream reported success with no output',
            'output',
          );
        }
        return { url, executionMs: Date.now() - startedAt };
      }
      if (['failed', 'canceled', 'cancelled', 'error'].includes(state)) {
        throw new HostedGenerationError(
          `generation ${state}`,
          'poll',
          status.status,
        );
      }
    }
  }
}
