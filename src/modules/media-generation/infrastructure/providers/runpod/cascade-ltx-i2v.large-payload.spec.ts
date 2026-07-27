import { CascadeLtxI2vProvider } from './cascade-ltx-i2v.provider';

/**
 * Production lost every video above roughly 5 MB of base64 to
 * RUNPOD_OUTPUT_INVALID: the old base64 guard used a grouped repetition
 * (`(?:[A-Za-z0-9+/]{4})*`), which V8 evaluates on the stack and which throws
 * RangeError on long inputs. The clip was fine — our own validation blew up.
 * Bigger clips became common as soon as the motion enhancer was enabled.
 */
describe('CascadeLtxI2vProvider — oversized inline payloads', () => {
  const buildProvider = (videoB64: string) => {
    const client = {
      fetchJobStatus: jest.fn(async () => ({
        status: 'COMPLETED',
        output: { video_b64: videoB64 },
      })),
    };
    const extractor = {
      extractVideoSource: jest.fn(
        (output: any) => `data:video/mp4;base64,${output.video_b64}`,
      ),
    };
    const provider: any = Object.create(CascadeLtxI2vProvider.prototype);
    Object.assign(provider, {
      client,
      extractor,
      logger: { warn: jest.fn() },
    });
    return provider;
  };

  const route = {
    endpointId: 'abcdefgh1234',
    apiKeyConfigKey: 'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
  } as any;

  const mp4Base64 = (byteLength: number): string => {
    const buffer = Buffer.alloc(byteLength);
    buffer.write('\0\0\0\x18ftypmp42', 0, 'binary');
    return buffer.toString('base64');
  };

  it('accepts a ~7 MB base64 clip, the size that used to fail', async () => {
    // 6_874_032 base64 chars is the exact length seen in the failing prod job.
    const payload = mp4Base64(5_155_524);
    expect(payload.length).toBeGreaterThan(6_800_000);

    const provider = buildProvider(payload);

    await expect(
      provider.getStatus(route, 'runpod_job_12345678'),
    ).resolves.toEqual({ status: 'completed' });
  });

  it('still rejects a payload that is not base64', async () => {
    const provider = buildProvider('not base64 at all $$$$');

    await expect(
      provider.getStatus(route, 'runpod_job_12345678'),
    ).resolves.toEqual({ status: 'output_missing' });
  });

  it('still rejects base64 that does not start with an mp4 ftyp box', async () => {
    const provider = buildProvider(Buffer.alloc(4096).toString('base64'));

    await expect(
      provider.getStatus(route, 'runpod_job_12345678'),
    ).resolves.toEqual({ status: 'output_missing' });
  });
});
