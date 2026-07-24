import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import { TextVideoArtifactReaperService } from './text-video-artifact-reaper.service';

const workflow = (
  overrides: Partial<MediaTextVideoWorkflowEntity> = {},
): MediaTextVideoWorkflowEntity =>
  Object.assign(new MediaTextVideoWorkflowEntity(), {
    taskId: 'task_12345678',
    state: 'COMPLETED',
    version: 7,
    artifactCleanupStatus: 'pending',
    artifactCleanupAfter: new Date(0),
    privateArtifactRef: 'private_artifact_123456789',
    videoPrivateArtifactRef: `video_stage_${'a'.repeat(64)}`,
    videoArtifactSha256: 'b'.repeat(64),
    videoArtifactByteLength: 1024,
    videoWidth: 1280,
    videoHeight: 704,
    videoHasAudio: true,
    ...overrides,
  });

function harness(candidate: MediaTextVideoWorkflowEntity) {
  const claimed = workflow({
    ...candidate,
    version: candidate.version + 1,
    artifactCleanupStatus: 'claimed',
    artifactCleanupClaimedAt: new Date(),
  });
  const repository = {
    findCleanupDue: jest.fn(async () => [candidate]),
  };
  const workflows = {
    claimArtifactCleanup: jest.fn(async () => claimed),
    completeArtifactCleanup: jest.fn(async () =>
      workflow({
        ...claimed,
        version: claimed.version + 1,
        artifactCleanupStatus: 'completed',
      }),
    ),
    releaseArtifactCleanup: jest.fn(async () => claimed),
  };
  const stillStore = {
    deleteCanonicalPng: jest.fn(async () => undefined),
  };
  const videoProvider = {
    deleteStaged: jest.fn(async () => undefined),
  };
  const service = new TextVideoArtifactReaperService(
    repository as any,
    workflows as any,
    stillStore as any,
    videoProvider as any,
  );
  return {
    service,
    repository,
    workflows,
    stillStore,
    videoProvider,
  };
}

describe('TextVideoArtifactReaperService', () => {
  it('deletes both private artifacts under a durable claim', async () => {
    const h = harness(workflow());

    await h.service.reapDueArtifacts();

    expect(h.workflows.claimArtifactCleanup).toHaveBeenCalledWith(
      'task_12345678',
      7,
    );
    expect(h.stillStore.deleteCanonicalPng).toHaveBeenCalledTimes(1);
    expect(h.videoProvider.deleteStaged).toHaveBeenCalledWith(
      expect.objectContaining({
        privateArtifactRef: `video_stage_${'a'.repeat(64)}`,
        artifactSha256: 'b'.repeat(64),
      }),
    );
    expect(h.workflows.completeArtifactCleanup).toHaveBeenCalledWith(
      'task_12345678',
      8,
    );
  });

  it('never deletes artifacts from FINALIZING workflows', async () => {
    const h = harness(workflow({ state: 'FINALIZING' }));

    await h.service.reapDueArtifacts();

    expect(h.workflows.claimArtifactCleanup).not.toHaveBeenCalled();
    expect(h.stillStore.deleteCanonicalPng).not.toHaveBeenCalled();
    expect(h.videoProvider.deleteStaged).not.toHaveBeenCalled();
  });

  it('releases a failed cleanup claim for retry', async () => {
    const h = harness(workflow());
    h.videoProvider.deleteStaged.mockRejectedValueOnce(
      new Error('OBJECT_DELETE_FAILED'),
    );

    await h.service.reapDueArtifacts();

    expect(h.workflows.completeArtifactCleanup).not.toHaveBeenCalled();
    expect(h.workflows.releaseArtifactCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_12345678',
        expectedVersion: 8,
        retryAfter: expect.any(Date),
      }),
    );
  });
});
