import {
  LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
  TextVideoCascadeRuntimeSnapshot,
} from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import {
  CanonicalPrunaStillArtifact,
  MaterializedPrunaStillArtifact,
  PrunaStillMaterializationRequest,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image-still.provider';
import {
  PrunaPImageGenerationInput,
  PrunaPredictionStatus,
  PrunaStillSubmission,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.types';
import { CascadeLtxI2VPayload } from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v-payload.builder';
import { VideoGenerationResult } from 'src/modules/media-generation/domain/contracts/video-generation-result.contract';

export const TEXT_VIDEO_STILL_PROVIDER = Symbol('TEXT_VIDEO_STILL_PROVIDER');
export const TEXT_VIDEO_STILL_QC = Symbol('TEXT_VIDEO_STILL_QC');
export const TEXT_VIDEO_VIDEO_QC = Symbol('TEXT_VIDEO_VIDEO_QC');
export const TEXT_VIDEO_I2V_PROVIDER = Symbol('TEXT_VIDEO_I2V_PROVIDER');
export const TEXT_VIDEO_PRIVATE_ARTIFACT_STORE = Symbol(
  'TEXT_VIDEO_PRIVATE_ARTIFACT_STORE',
);
export const TEXT_VIDEO_WORKFLOW_REPOSITORY = Symbol(
  'TEXT_VIDEO_WORKFLOW_REPOSITORY',
);
export const TEXT_VIDEO_WORKFLOW_STATE_MACHINE = Symbol(
  'TEXT_VIDEO_WORKFLOW_STATE_MACHINE',
);

export interface CompiledTextVideoPrompts {
  compilerVersion: string;
  stillPrompt: string;
  motionPrompt: string;
}

export interface TextVideoPromptCompilerPort {
  compile(prompt: string): CompiledTextVideoPrompts;
  isConfigured(): boolean;
}

export interface TextVideoStillProviderPort {
  submit(
    input: PrunaPImageGenerationInput,
    expectedPolicySha256: string,
  ): Promise<PrunaStillSubmission>;
  getStatus(
    predictionId: string,
    expectedPolicySha256: string,
  ): Promise<PrunaPredictionStatus>;
  materialize(
    request: Readonly<PrunaStillMaterializationRequest>,
    expectedPolicySha256: string,
  ): Promise<MaterializedPrunaStillArtifact>;
  loadCanonicalBytes(
    artifact: Readonly<CanonicalPrunaStillArtifact>,
  ): Promise<Buffer>;
}

export interface TextVideoStillQcInput {
  canonicalPng: Buffer;
  artifact: Readonly<CanonicalPrunaStillArtifact>;
  stillPromptSha256: string;
  policyVersion: string;
}

export interface TextVideoVideoQcInput {
  runpodJobId: string;
  videoArtifactSha256: string;
  artifact: Readonly<StagedCascadeVideo>;
  mp4Bytes: Buffer;
  motionPromptSha256: string;
  policyVersion: string;
}

export interface TextVideoQcResult {
  decision: 'pass' | 'reject' | 'error';
  reasonCode: string | null;
  durationMs: number;
}

export interface TextVideoStillQcPort {
  isConfigured(): boolean;
  evaluate(input: Readonly<TextVideoStillQcInput>): Promise<TextVideoQcResult>;
}

export interface TextVideoVideoQcPort {
  isConfigured(): boolean;
  evaluate(input: Readonly<TextVideoVideoQcInput>): Promise<TextVideoQcResult>;
}

export type CascadeI2vSubmission =
  | { certainty: 'accepted'; jobId: string }
  | {
      certainty: 'unknown';
      reasonCode: 'RUNPOD_SUBMISSION_UNCERTAIN';
    };

export type CascadeI2vStatus =
  | { status: 'pending' }
  | { status: 'completed' }
  | {
      status: 'failed';
      reasonCode:
        | 'RUNPOD_JOB_FAILED'
        | 'RUNPOD_JOB_CANCELLED'
        | 'RUNPOD_JOB_TIMED_OUT';
    };

export interface MaterializedCascadeVideo {
  result: VideoGenerationResult;
  artifactSha256: string;
}

export interface StagedCascadeVideo {
  privateArtifactRef: string;
  artifactSha256: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
}

export interface LoadedStagedCascadeVideo {
  artifact: StagedCascadeVideo;
  mp4Bytes: Buffer;
}

export interface CascadeLtxI2vRoute {
  endpointId: string;
  apiKeyConfigKey: typeof LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY;
}

export interface TextVideoI2vProviderPort {
  submit(
    route: Readonly<CascadeLtxI2vRoute>,
    payload: Readonly<CascadeLtxI2VPayload>,
  ): Promise<CascadeI2vSubmission>;
  getStatus(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
  ): Promise<CascadeI2vStatus>;
  stageForQc(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
    idempotencyKey: string,
  ): Promise<StagedCascadeVideo>;
  loadStagedForQc(
    artifact: Readonly<StagedCascadeVideo>,
  ): Promise<LoadedStagedCascadeVideo>;
  publishOnce(
    route: Readonly<CascadeLtxI2vRoute>,
    jobId: string,
    artifact: Readonly<StagedCascadeVideo>,
    idempotencyKey: string,
  ): Promise<MaterializedCascadeVideo>;
  deleteStaged(artifact: Readonly<StagedCascadeVideo>): Promise<void>;
}

export interface TextVideoCascadeReadinessInput {
  runtime: Readonly<TextVideoCascadeRuntimeSnapshot>;
  compiler: TextVideoPromptCompilerPort;
  stillQc: TextVideoStillQcPort;
  videoQc: TextVideoVideoQcPort;
  privateArtifactStoreConfigured: boolean;
}
