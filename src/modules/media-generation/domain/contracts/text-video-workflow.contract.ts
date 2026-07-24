import { LtxTextPipelineMode } from './ltx-text-pipeline-mode.contract';
import { LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY } from './text-video-cascade-settings.contract';

export const TEXT_VIDEO_WORKFLOW_STATES = [
  'QUEUED',
  'COMPILING',
  'PLANNED',
  'STILL_SUBMITTING',
  'STILL_RUNNING',
  'STILL_SUBMISSION_UNCERTAIN',
  'STILL_READY',
  'STILL_CANONICALIZED',
  'STILL_QC',
  'STILL_ACCEPTED',
  'I2V_SUBMITTING',
  'I2V_RUNNING',
  'VIDEO_READY',
  'VIDEO_QC',
  'VIDEO_ACCEPTED',
  'FINALIZING',
  'COMPLETED',
  'FAILED',
] as const;

export type TextVideoWorkflowState =
  (typeof TEXT_VIDEO_WORKFLOW_STATES)[number];

export type TextVideoWorkflowRefundStatus = 'none' | 'required' | 'completed';

export type TextVideoWorkflowQcDecision = 'pass' | 'reject' | 'error';

export type TextVideoStillProvider = 'pruna_p_image';
export type TextVideoStillModel = 'p-image';

export interface TextVideoWorkflowSnapshot {
  taskId: string;
  userId: number;
  chargeId: string;
  contestSubmissionId: number | null;
  pipelineMode: LtxTextPipelineMode;
  pipelineConfigVersion: string;
  prunaClientPolicySha256: string;
  promptCompilerVersion: string;
  stillQcPolicyVersion: string;
  videoQcPolicyVersion: string;
  cascadeRunpodEndpointId: string;
  cascadeRunpodApiKeyConfigKey: typeof LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY;
  artifactTtlMs: number;
  stillPollIntervalMs: number;
  stillTotalTimeoutMs: number;
  i2vPollIntervalMs: number;
  i2vTotalTimeoutMs: number;
  rawPromptSha256: string;
  stillPromptSha256: string;
  motionPromptSha256: string;
  width: 704 | 1280;
  height: 704 | 1280;
  frames: 121 | 241;
  fps: 24;
  stillSeed: number;
  videoSeed: number;
  stillProvider: TextVideoStillProvider | null;
  stillModel: TextVideoStillModel | null;
}

export type TextVideoWorkflowResumeAction =
  | 'START_COMPILATION'
  | 'RESUME_COMPILATION'
  | 'PREPARE_STILL_SUBMISSION'
  | 'CLAIM_STILL_SUBMISSION'
  | 'FAIL_STILL_SUBMISSION_UNCERTAIN'
  | 'POLL_STILL'
  | 'MATERIALIZE_STILL'
  | 'RUN_STILL_QC'
  | 'PREPARE_I2V_SUBMISSION'
  | 'CLAIM_I2V_SUBMISSION'
  | 'FAIL_I2V_SUBMISSION_UNCERTAIN'
  | 'POLL_I2V'
  | 'RUN_VIDEO_QC'
  | 'FINALIZE_POST'
  | 'REFUND'
  | 'DONE';
