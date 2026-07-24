import { Injectable } from '@nestjs/common';
import {
  CascadeLtxI2vRoute,
  CascadeI2vStatus,
  CascadeI2vSubmission,
  LoadedStagedCascadeVideo,
  MaterializedCascadeVideo,
  StagedCascadeVideo,
  TextVideoI2vProviderPort,
} from 'src/modules/media-generation/application/text-video/text-video-pipeline.ports';
import { LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY } from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import { UploadService } from 'src/modules/uploads/upload.service';
import { CascadeLtxI2VPayload } from './cascade-ltx-i2v-payload.builder';
import { RunpodMediaClient } from './runpod-media.client';
import { RunpodOutputExtractor } from './runpod-output.extractor';

const SAFE_PROVIDER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ENDPOINT_ID = /^[A-Za-z0-9_-]{3,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export class CascadeLtxI2vProviderError extends Error {
  constructor(
    readonly reasonCode:
      | 'RUNPOD_STATUS_UNAVAILABLE'
      | 'RUNPOD_OUTPUT_INVALID'
      | 'RUNPOD_VIDEO_STORE_FAILED'
      | 'RUNPOD_CASCADE_ROUTE_INVALID',
    readonly retryable: boolean,
  ) {
    super(reasonCode);
    this.name = 'CascadeLtxI2vProviderError';
  }

  toJSON(): { reasonCode: string; retryable: boolean } {
    return { reasonCode: this.reasonCode, retryable: this.retryable };
  }
}

/**
 * Dedicated cascade adapter. It never participates in the public provider
 * router and always sends the already-built I2V payload (enhance:true since 2026-07-24 — the worker's motion-director enhancer measurably unfreezes subject motion; see workers/out/crf-battery-2026-07-24/RESULTS.md).
 */
@Injectable()
export class CascadeLtxI2vProvider implements TextVideoI2vProviderPort {
  constructor(
    private readonly client: RunpodMediaClient,
    private readonly extractor: RunpodOutputExtractor,
    private readonly uploadService: UploadService,
  ) {}

  async submit(
    route: Readonly<CascadeLtxI2vRoute>,
    payload: Readonly<CascadeLtxI2VPayload>,
  ): Promise<CascadeI2vSubmission> {
    assertCascadeRoute(route);
    try {
      const job = await this.client.submitJob(
        route.endpointId,
        { input: { ...payload } },
        route.apiKeyConfigKey,
      );
      if (!job || !SAFE_PROVIDER_ID.test(job.id)) {
        return {
          certainty: 'unknown',
          reasonCode: 'RUNPOD_SUBMISSION_UNCERTAIN',
        };
      }
      return { certainty: 'accepted', jobId: job.id };
    } catch {
      return {
        certainty: 'unknown',
        reasonCode: 'RUNPOD_SUBMISSION_UNCERTAIN',
      };
    }
  }

  async getStatus(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
  ): Promise<CascadeI2vStatus> {
    assertCascadeRoute(route);
    assertJobId(jobId);
    let job;
    try {
      job = await this.client.fetchJobStatus(
        route.endpointId,
        jobId,
        route.apiKeyConfigKey,
      );
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_STATUS_UNAVAILABLE', true);
    }

    switch (job.status) {
      case 'IN_QUEUE':
      case 'IN_PROGRESS':
        return { status: 'pending' };
      case 'COMPLETED':
        try {
          assertStrictInlineMp4(this.extractor.extractVideoSource(job.output));
          return { status: 'completed' };
        } catch {
          throw new CascadeLtxI2vProviderError('RUNPOD_OUTPUT_INVALID', false);
        }
      case 'FAILED':
        return { status: 'failed', reasonCode: 'RUNPOD_JOB_FAILED' };
      case 'CANCELLED':
        return { status: 'failed', reasonCode: 'RUNPOD_JOB_CANCELLED' };
      case 'TIMED_OUT':
        return { status: 'failed', reasonCode: 'RUNPOD_JOB_TIMED_OUT' };
    }
  }

  async stageForQc(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
    idempotencyKey: string,
  ): Promise<StagedCascadeVideo> {
    assertCascadeRoute(route);
    assertJobId(jobId);
    let providerVideoData: string;
    try {
      const job = await this.client.fetchJobStatus(
        route.endpointId,
        jobId,
        route.apiKeyConfigKey,
      );
      if (job.status !== 'COMPLETED') {
        throw new Error();
      }
      providerVideoData = assertStrictInlineMp4(
        this.extractor.extractVideoSource(job.output),
      );
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_OUTPUT_INVALID', false);
    }

    try {
      const asset = await this.uploadService.stagePrivateVideoByDataOnce(
        providerVideoData,
        idempotencyKey,
      );
      if (!SHA256.test(asset.sourceSha256)) {
        throw new Error();
      }
      return {
        artifactSha256: asset.sourceSha256,
        privateArtifactRef: asset.privateArtifactRef,
        byteLength: asset.byteLength,
        width: asset.width,
        height: asset.height,
        hasAudio: asset.hasAudio,
      };
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_VIDEO_STORE_FAILED', true);
    }
  }

  async loadStagedForQc(
    artifact: Readonly<StagedCascadeVideo>,
  ): Promise<LoadedStagedCascadeVideo> {
    assertStagedArtifact(artifact);
    try {
      const [loaded, mp4Bytes] = await Promise.all([
        this.uploadService.loadStagedPrivateVideo(
          artifact.privateArtifactRef,
          artifact.artifactSha256,
        ),
        this.uploadService.loadStagedPrivateVideoBytes(
          artifact.privateArtifactRef,
          artifact.artifactSha256,
        ),
      ]);
      const adopted = stagedFromUpload(loaded);
      assertSameStagedArtifact(artifact, adopted);
      return { artifact: adopted, mp4Bytes };
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_VIDEO_STORE_FAILED', true);
    }
  }

  async publishOnce(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
    artifact: Readonly<StagedCascadeVideo>,
    idempotencyKey: string,
  ): Promise<MaterializedCascadeVideo> {
    assertCascadeRoute(route);
    assertJobId(jobId);
    assertStagedArtifact(artifact);
    try {
      const asset = await this.uploadService.publishStagedVideoOnce(
        artifact.privateArtifactRef,
        artifact.artifactSha256,
        idempotencyKey,
      );
      if (asset.sourceSha256 !== artifact.artifactSha256) {
        throw new Error();
      }
      return {
        artifactSha256: artifact.artifactSha256,
        result: {
          videoUrl: asset.videoUrl,
          previewImageUrl: asset.previewImageUrl,
          width: asset.width,
          height: asset.height,
          hasAudio: asset.hasAudio,
          rawOutput: { provider: 'runpod', jobId },
        },
      };
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_VIDEO_STORE_FAILED', true);
    }
  }

  async deleteStaged(artifact: Readonly<StagedCascadeVideo>): Promise<void> {
    assertStagedArtifact(artifact);
    try {
      await this.uploadService.deleteStagedPrivateVideo(
        artifact.privateArtifactRef,
      );
    } catch {
      throw new CascadeLtxI2vProviderError('RUNPOD_VIDEO_STORE_FAILED', true);
    }
  }
}

function assertJobId(jobId: string): void {
  if (!SAFE_PROVIDER_ID.test(jobId)) {
    throw new CascadeLtxI2vProviderError('RUNPOD_OUTPUT_INVALID', false);
  }
}

function assertCascadeRoute(route: Readonly<CascadeLtxI2vRoute>): void {
  if (
    !route ||
    !SAFE_ENDPOINT_ID.test(route.endpointId) ||
    route.apiKeyConfigKey !== LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY
  ) {
    throw new CascadeLtxI2vProviderError('RUNPOD_CASCADE_ROUTE_INVALID', false);
  }
}

function assertStrictInlineMp4(source: string): string {
  const prefix = 'data:video/mp4;base64,';
  if (typeof source !== 'string' || !source.startsWith(prefix)) {
    throw new Error('RUNPOD_OUTPUT_INVALID');
  }
  const payload = source.slice(prefix.length);
  if (
    payload.length < 16 ||
    payload.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      payload,
    )
  ) {
    throw new Error('RUNPOD_OUTPUT_INVALID');
  }
  const header = Buffer.from(payload.slice(0, 24), 'base64');
  if (
    header.byteLength < 8 ||
    header.subarray(4, 8).toString('ascii') !== 'ftyp'
  ) {
    throw new Error('RUNPOD_OUTPUT_INVALID');
  }
  return source;
}

function assertStagedArtifact(artifact: Readonly<StagedCascadeVideo>): void {
  if (
    !artifact ||
    !/^video_stage_[a-f0-9]{64}$/.test(artifact.privateArtifactRef) ||
    !SHA256.test(artifact.artifactSha256) ||
    !Number.isSafeInteger(artifact.byteLength) ||
    artifact.byteLength <= 0
  ) {
    throw new CascadeLtxI2vProviderError('RUNPOD_VIDEO_STORE_FAILED', false);
  }
}

function stagedFromUpload(asset: {
  privateArtifactRef: string;
  sourceSha256: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
}): StagedCascadeVideo {
  return {
    privateArtifactRef: asset.privateArtifactRef,
    artifactSha256: asset.sourceSha256,
    byteLength: asset.byteLength,
    width: asset.width,
    height: asset.height,
    hasAudio: asset.hasAudio,
  };
}

function assertSameStagedArtifact(
  expected: Readonly<StagedCascadeVideo>,
  actual: Readonly<StagedCascadeVideo>,
): void {
  if (
    expected.privateArtifactRef !== actual.privateArtifactRef ||
    expected.artifactSha256 !== actual.artifactSha256 ||
    expected.byteLength !== actual.byteLength ||
    expected.width !== actual.width ||
    expected.height !== actual.height ||
    expected.hasAudio !== actual.hasAudio
  ) {
    throw new Error('VIDEO_STAGE_INVARIANT_MISMATCH');
  }
}
