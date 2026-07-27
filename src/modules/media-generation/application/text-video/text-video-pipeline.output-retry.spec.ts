import { TextVideoPipelineService } from './text-video-pipeline.service';

/**
 * Production saw ~20% of cascade generations die with RUNPOD_OUTPUT_INVALID
 * whenever the content bot fired several videos at once: RunPod reported
 * COMPLETED a moment before the job output was readable back, and the first
 * such poll failed the workflow permanently. The poll loop must ride that out.
 */
describe('TextVideoPipelineService — COMPLETED before the output is readable', () => {
  const buildHarness = (statuses: Array<{ status: string }>) => {
    const getStatus = jest.fn(async () => statuses.shift() ?? { status: 'completed' });
    const stageForQc = jest.fn(async () => ({
      privateArtifactRef: `video_stage_${'a'.repeat(64)}`,
      artifactSha256: 'b'.repeat(64),
      byteLength: 2_000_000,
      width: 1280,
      height: 704,
      hasAudio: true,
    }));
    const workflow: any = {
      taskId: 'task-1',
      version: 1,
      runpodJobId: 'job-1',
      cascadeRunpodEndpointId: 'abcdefgh1234',
      artifactDeleteAfter: null,
    };
    const service: any = Object.create(TextVideoPipelineService.prototype);
    Object.assign(service, {
      i2vProvider: { getStatus, stageForQc },
      clock: {
        now: () => new Date('2026-07-27T08:00:00Z'),
        sleep: jest.fn(async () => undefined),
      },
      workflows: {
        markVideoReady: jest.fn(async () => ({ ...workflow, version: 2 })),
      },
    });
    return { service, workflow, getStatus, stageForQc };
  };

  const runtime = {
    i2vPollIntervalMs: 1_000,
    i2vTotalTimeoutMs: 600_000,
    artifactTtlMs: 86_400_000,
  } as any;

  it('keeps polling and succeeds once the output becomes readable', async () => {
    const { service, workflow, getStatus, stageForQc } = buildHarness([
      { status: 'pending' },
      { status: 'output_missing' },
      { status: 'output_missing' },
      { status: 'completed' },
    ]);

    const result = await service.waitForI2v(workflow, runtime);

    expect(getStatus).toHaveBeenCalledTimes(4);
    expect(stageForQc).toHaveBeenCalledTimes(1);
    expect(result.video.byteLength).toBe(2_000_000);
  });

  it('still fails once the provider output is persistently unusable', async () => {
    const { service, workflow } = buildHarness(
      Array.from({ length: 12 }, () => ({ status: 'output_missing' })),
    );

    await expect(service.waitForI2v(workflow, runtime)).rejects.toMatchObject({
      reasonCode: 'RUNPOD_OUTPUT_INVALID',
    });
  });
});
