import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TextVideoStillModel,
  TextVideoStillProvider,
  TextVideoWorkflowQcDecision,
  TextVideoWorkflowRefundStatus,
  TextVideoWorkflowState,
} from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { LtxTextPipelineMode } from 'src/modules/media-generation/domain/contracts/ltx-text-pipeline-mode.contract';
import { LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY } from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';

@Entity('media_text_video_workflows')
@Index('IDX_media_text_video_workflows_task_id', ['taskId'], {
  unique: true,
})
@Index(
  'IDX_media_text_video_workflows_prediction_id',
  ['providerPredictionId'],
  {
    unique: true,
  },
)
@Index('IDX_media_text_video_workflows_runpod_job_id', ['runpodJobId'], {
  unique: true,
})
@Index('IDX_media_text_video_workflows_final_post_id', ['finalPostId'], {
  unique: true,
})
@Index('IDX_media_text_video_workflows_state_updated', ['state', 'updatedAt'])
@Index('IDX_media_text_video_workflows_user_created', ['userId', 'createdAt'])
@Index('IDX_media_text_video_workflows_refund_state', ['refundStatus', 'state'])
@Index('IDX_media_text_video_workflows_cleanup_due', [
  'artifactCleanupStatus',
  'artifactCleanupAfter',
])
@Index('IDX_media_text_video_workflows_cleanup_claim', [
  'artifactCleanupStatus',
  'artifactCleanupClaimedAt',
])
export class MediaTextVideoWorkflowEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Immutable enqueue-time snapshot.
  @Column({ type: 'varchar', length: 64 })
  taskId: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  chargeId: string;

  @Column({ type: 'int', nullable: true })
  contestSubmissionId: number | null;

  @Column({ type: 'varchar', length: 16 })
  pipelineMode: LtxTextPipelineMode;

  @Column({ type: 'varchar', length: 128 })
  pipelineConfigVersion: string;

  @Column({ type: 'char', length: 64 })
  prunaClientPolicySha256: string;

  @Column({ type: 'varchar', length: 128 })
  promptCompilerVersion: string;

  @Column({ type: 'varchar', length: 128 })
  stillQcPolicyVersion: string;

  @Column({ type: 'varchar', length: 128 })
  videoQcPolicyVersion: string;

  @Column({ type: 'varchar', length: 128 })
  cascadeRunpodEndpointId: string;

  @Column({ type: 'varchar', length: 128 })
  cascadeRunpodApiKeyConfigKey: typeof LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY;

  @Column({ type: 'int', unsigned: true })
  artifactTtlMs: number;

  @Column({ type: 'int', unsigned: true })
  stillPollIntervalMs: number;

  @Column({ type: 'int', unsigned: true })
  stillTotalTimeoutMs: number;

  @Column({ type: 'int', unsigned: true })
  i2vPollIntervalMs: number;

  @Column({ type: 'int', unsigned: true })
  i2vTotalTimeoutMs: number;

  @Column({ type: 'char', length: 64 })
  rawPromptSha256: string;

  @Column({ type: 'char', length: 64 })
  stillPromptSha256: string;

  @Column({ type: 'char', length: 64 })
  motionPromptSha256: string;

  @Column({ type: 'smallint', unsigned: true })
  width: 704 | 1280;

  @Column({ type: 'smallint', unsigned: true })
  height: 704 | 1280;

  @Column({ type: 'smallint', unsigned: true })
  frames: 121 | 241;

  @Column({ type: 'smallint', unsigned: true, default: 24 })
  fps: 24;

  @Column({ type: 'int', unsigned: true })
  stillSeed: number;

  @Column({ type: 'int', unsigned: true })
  videoSeed: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  stillProvider: TextVideoStillProvider | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  stillModel: TextVideoStillModel | null;

  // Mutable state and optimistic compare-and-swap version.
  @Column({ type: 'varchar', length: 40, default: 'QUEUED' })
  state: TextVideoWorkflowState;

  @Column({ type: 'int', unsigned: true, default: 0 })
  version: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  terminalReasonCode: string | null;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  refundStatus: TextVideoWorkflowRefundStatus;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  refundCompletedAt: Date | null;

  // P-Image submission and materialization. No prompt, URL or provider body.
  @Column({ type: 'char', length: 36, nullable: true })
  submissionAttemptId: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  stillRequestSha256: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  stillPostDispatchClaimedAt: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerPredictionId: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  stillSubmissionAcceptedAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  stillReadyAt: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sourceMime: 'image/jpeg' | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  sourceByteLength: number | null;

  @Column({ type: 'char', length: 64, nullable: true })
  sourceSha256: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  canonicalMime: 'image/png' | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  canonicalByteLength: number | null;

  @Column({ type: 'char', length: 64, nullable: true })
  canonicalSha256: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  decodedRgbSha256: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  privateArtifactRef: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  artifactDeleteAfter: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  stillCanonicalizedAt: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  stillQcDecision: TextVideoWorkflowQcDecision | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  stillQcReasonCode: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  stillQcCompletedAt: Date | null;

  // LTX I2V submission and video acceptance. No payload/base64/output URL.
  @Column({ type: 'char', length: 64, nullable: true })
  i2vRequestSha256: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  i2vDispatchClaimedAt: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  runpodJobId: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  i2vAcceptedAt: Date | null;

  @Column({ type: 'char', length: 64, nullable: true })
  videoArtifactSha256: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  videoPrivateArtifactRef: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  videoArtifactByteLength: number | null;

  @Column({ type: 'smallint', unsigned: true, nullable: true })
  videoWidth: number | null;

  @Column({ type: 'smallint', unsigned: true, nullable: true })
  videoHeight: number | null;

  @Column({ type: 'boolean', nullable: true })
  videoHasAudio: boolean | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  videoArtifactDeleteAfter: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  videoReadyAt: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  videoQcDecision: TextVideoWorkflowQcDecision | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  videoQcReasonCode: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  videoQcCompletedAt: Date | null;

  // Mutually exclusive terminal side-effect markers.
  @Column({ type: 'int', nullable: true })
  finalPostId: number | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  finalizingAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  failedAt: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'not_required' })
  artifactCleanupStatus: 'not_required' | 'pending' | 'claimed' | 'completed';

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  artifactCleanupAfter: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  artifactCleanupClaimedAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  artifactCleanupCompletedAt: Date | null;

  // Safe bounded stage timings.
  @Column({ type: 'int', unsigned: true, nullable: true })
  stillSubmitDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  stillPollDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  stillDownloadDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  stillCanonicalizeDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  stillQcDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  i2vDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  videoQcDurationMs: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  totalDurationMs: number | null;

  @CreateDateColumn({
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}
