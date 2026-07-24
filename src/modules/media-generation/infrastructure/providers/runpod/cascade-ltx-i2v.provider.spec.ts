import { CascadeLtxI2vRoute } from 'src/modules/media-generation/application/text-video/text-video-pipeline.ports';
import { CascadeLtxI2VPayload } from './cascade-ltx-i2v-payload.builder';
import { CascadeLtxI2vProvider } from './cascade-ltx-i2v.provider';

const ROUTE: CascadeLtxI2vRoute = {
  endpointId: 'cascade_endpoint_12345678',
  apiKeyConfigKey: 'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
};

const PAYLOAD: CascadeLtxI2VPayload = {
  prompt: 'A robot waves once.',
  image_b64: 'canonical-png-base64',
  width: 1280,
  height: 704,
  frames: 121,
  fps: 24,
  audio: true,
  tier: 'quality',
  seed: 33102,
  cas_amount: 0,
  enhance: false,
};
const INLINE_MP4 = `data:video/mp4;base64,${Buffer.from([
  0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]).toString('base64')}`;
const STAGED_REF = `video_stage_${'b'.repeat(64)}`;

function createProvider() {
  const client = {
    submitJob: jest.fn(async () => ({
      id: 'runpod_job_12345678',
      status: 'IN_QUEUE',
    })),
    fetchJobStatus: jest.fn(async () => ({
      id: 'runpod_job_12345678',
      status: 'COMPLETED',
      output: { video: INLINE_MP4 },
    })),
  };
  const extractor = {
    hasExtractableVideoSource: jest.fn(() => true),
    extractVideoSource: jest.fn(() => INLINE_MP4),
  };
  const uploadService = {
    stagePrivateVideoByDataOnce: jest.fn(async () => ({
      privateArtifactRef: STAGED_REF,
      byteLength: 12,
      sourceSha256: 'a'.repeat(64),
      width: 1280,
      height: 704,
      hasAudio: true,
    })),
    loadStagedPrivateVideo: jest.fn(async () => ({
      privateArtifactRef: STAGED_REF,
      byteLength: 12,
      sourceSha256: 'a'.repeat(64),
      width: 1280,
      height: 704,
      hasAudio: true,
    })),
    loadStagedPrivateVideoBytes: jest.fn(async () =>
      Buffer.from('private-mp4'),
    ),
    publishStagedVideoOnce: jest.fn(async () => ({
      videoUrl: 'https://cdn.test/result.mp4',
      previewImageUrl: 'https://cdn.test/result.jpg',
      width: 1280,
      height: 704,
      hasAudio: true,
      sourceSha256: 'a'.repeat(64),
    })),
    deleteStagedPrivateVideo: jest.fn(async () => undefined),
  };
  return {
    provider: new CascadeLtxI2vProvider(
      client as any,
      extractor as any,
      uploadService as any,
    ),
    client,
    extractor,
    uploadService,
  };
}

describe('CascadeLtxI2vProvider dedicated route', () => {
  it('submits only to the snapshotted cascade endpoint and dedicated key', async () => {
    const { provider, client } = createProvider();

    await expect(provider.submit(ROUTE, PAYLOAD)).resolves.toEqual({
      certainty: 'accepted',
      jobId: 'runpod_job_12345678',
    });

    expect(client.submitJob).toHaveBeenCalledWith(
      'cascade_endpoint_12345678',
      { input: PAYLOAD },
      'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
    );
  });

  it('does not fall back to the native video key', async () => {
    const { provider, client } = createProvider();
    const nativeKeyRoute = {
      ...ROUTE,
      apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    } as unknown as CascadeLtxI2vRoute;

    await expect(provider.submit(nativeKeyRoute, PAYLOAD)).rejects.toEqual(
      expect.objectContaining({
        reasonCode: 'RUNPOD_CASCADE_ROUTE_INVALID',
        retryable: false,
      }),
    );
    expect(client.submitJob).not.toHaveBeenCalled();
  });

  it('polls, stages privately, and publishes through the dedicated route', async () => {
    const { provider, client, uploadService } = createProvider();

    await expect(
      provider.getStatus(ROUTE, 'runpod_job_12345678'),
    ).resolves.toEqual({ status: 'completed' });
    await expect(
      provider.stageForQc(ROUTE, 'runpod_job_12345678', 'task_12345678'),
    ).resolves.toMatchObject({
      artifactSha256: 'a'.repeat(64),
      privateArtifactRef: STAGED_REF,
    });
    const staged = {
      privateArtifactRef: STAGED_REF,
      artifactSha256: 'a'.repeat(64),
      byteLength: 12,
      width: 1280,
      height: 704,
      hasAudio: true,
    };
    await expect(
      provider.publishOnce(
        ROUTE,
        'runpod_job_12345678',
        staged,
        'task_12345678',
      ),
    ).resolves.toMatchObject({
      artifactSha256: 'a'.repeat(64),
      result: {
        videoUrl: 'https://cdn.test/result.mp4',
        rawOutput: {
          provider: 'runpod',
          jobId: 'runpod_job_12345678',
        },
      },
    });

    expect(client.fetchJobStatus).toHaveBeenNthCalledWith(
      1,
      'cascade_endpoint_12345678',
      'runpod_job_12345678',
      'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
    );
    expect(client.fetchJobStatus).toHaveBeenNthCalledWith(
      2,
      'cascade_endpoint_12345678',
      'runpod_job_12345678',
      'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
    );
    expect(uploadService.stagePrivateVideoByDataOnce).toHaveBeenCalledWith(
      INLINE_MP4,
      'task_12345678',
    );
    expect(uploadService.publishStagedVideoOnce).toHaveBeenCalledWith(
      STAGED_REF,
      'a'.repeat(64),
      'task_12345678',
    );
  });

  it('rejects an HTTP output without passing it to storage', async () => {
    const { provider, extractor, uploadService } = createProvider();
    extractor.extractVideoSource.mockReturnValue(
      'https://provider.test/result.mp4',
    );

    await expect(
      provider.getStatus(ROUTE, 'runpod_job_12345678'),
    ).rejects.toMatchObject({
      reasonCode: 'RUNPOD_OUTPUT_INVALID',
      retryable: false,
    });
    await expect(
      provider.stageForQc(ROUTE, 'runpod_job_12345678', 'task_12345678'),
    ).rejects.toMatchObject({
      reasonCode: 'RUNPOD_OUTPUT_INVALID',
      retryable: false,
    });
    expect(uploadService.stagePrivateVideoByDataOnce).not.toHaveBeenCalled();
  });
});
