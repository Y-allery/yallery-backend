import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { classifyMediaGenerationError } from 'src/modules/media-generation/domain/errors/media-generation-error-code';

// Every case below is a real throw site in the pipeline, quoted verbatim.
describe('classifyMediaGenerationError', () => {
  const axiosError = (extra: Record<string, unknown>) =>
    Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      ...extra,
    });

  it('reads the RunPod status poll timeout as provider_timeout', () => {
    // runpod-media.client.ts:104
    expect(
      classifyMediaGenerationError(
        new GatewayTimeoutException(
          'RunPod job 3f0a7664 did not finish within 1200000ms',
        ),
      ),
    ).toBe('provider_timeout');
  });

  it('reads a terminal RunPod job status as provider_error', () => {
    // runpod-media.client.ts:98
    expect(
      classifyMediaGenerationError(
        new BadGatewayException(
          'RunPod job abc failed with status FAILED: OOM',
        ),
      ),
    ).toBe('provider_error');
  });

  it('reads an unusable RunPod payload as provider_error', () => {
    // runpod-output.extractor.ts:51
    expect(
      classifyMediaGenerationError(
        new BadGatewayException('RunPod returned no usable image output'),
      ),
    ).toBe('provider_error');
  });

  it('reads moderation being down as provider_error, not a block', () => {
    expect(
      classifyMediaGenerationError(
        new ServiceUnavailableException(
          'Content safety validation is temporarily unavailable.',
        ),
      ),
    ).toBe('provider_error');
  });

  it('separates a content-safety block from ordinary bad input', () => {
    // Both are BadRequestException, so the status alone cannot tell them apart.
    expect(
      classifyMediaGenerationError(
        new BadRequestException(
          'This image request cannot be completed because it violates the content safety policy.',
        ),
      ),
    ).toBe('nsfw_blocked');

    expect(
      classifyMediaGenerationError(
        new BadRequestException('prompt is required'),
      ),
    ).toBe('invalid_input');
  });

  // The RunPod client calls axios with no try/catch, so these arrive unwrapped.
  it('classifies raw axios failures rather than dropping them in the fallback', () => {
    expect(
      classifyMediaGenerationError(axiosError({ code: 'ECONNABORTED' })),
    ).toBe('provider_timeout');
    expect(
      classifyMediaGenerationError(axiosError({ response: { status: 500 } })),
    ).toBe('provider_error');
    expect(
      classifyMediaGenerationError(axiosError({ code: 'ECONNREFUSED' })),
    ).toBe('provider_error');
  });

  it('does not blame the user for a 4xx coming back from the provider', () => {
    expect(
      classifyMediaGenerationError(axiosError({ response: { status: 401 } })),
    ).toBe('provider_error');
  });

  it('treats our own invariant slugs and missing config as internal_error', () => {
    expect(
      classifyMediaGenerationError(new Error('RUNPOD_OUTPUT_INVALID')),
    ).toBe('internal_error');
    expect(
      classifyMediaGenerationError(new Error('VIDEO_STAGE_INVARIANT_MISMATCH')),
    ).toBe('internal_error');
    expect(
      classifyMediaGenerationError(
        new Error('RUNPOD_VIDEO_API_KEY is not configured'),
      ),
    ).toBe('internal_error');
    expect(
      classifyMediaGenerationError(new TypeError('x is not a function')),
    ).toBe('internal_error');
  });

  it('falls back to unknown only for genuinely unplaceable failures', () => {
    expect(classifyMediaGenerationError(new Error('something odd'))).toBe(
      'unknown',
    );
    expect(classifyMediaGenerationError(new Error(''))).toBe('unknown');
    expect(classifyMediaGenerationError('not an error')).toBe('unknown');
    expect(classifyMediaGenerationError(undefined)).toBe('unknown');
  });
});
