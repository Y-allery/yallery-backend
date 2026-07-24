import { Column, Entity, Index } from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';

export type AIFinetuneStatus =
  | 'pending'
  | 'queued'
  | 'training'
  | 'ready'
  | 'failed';

export const AI_FINETUNE_MODEL_FAMILIES = ['krea2'] as const;
export type AIFinetuneModelFamily = (typeof AI_FINETUNE_MODEL_FAMILIES)[number];

export const AI_FINETUNE_DEFAULT_BASE_MODELS: Record<
  AIFinetuneModelFamily,
  string
> = {
  krea2: 'krea/Krea-2-Raw',
};

export interface AIFinetuneDatasetImage {
  url: string;
  caption?: string;
  publicId?: string;
  width?: number;
  height?: number;
  bytes?: number;
  originalName?: string;
}

export interface AIFinetuneTrainingSettings {
  resolution?: number;
  maxTrainSteps?: number;
  rank?: number;
  trainBatchSize?: number;
  gradientAccumulationSteps?: number;
  learningRate?: string;
  mixedPrecision?: string;
  seed?: number;
  enableRandomFlip?: boolean;
}

export interface AIFinetuneGenerationDefaults {
  loraScale?: number;
}

@Entity('ai_finetunes')
@Index('IDX_ai_finetunes_loraKey', ['loraKey'], { unique: true })
@Index('IDX_ai_finetunes_status', ['status'])
@Index('IDX_ai_finetunes_modelFamily', ['modelFamily'])
export class AIFinetuneEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  triggerWord: string;

  @Column({ type: 'varchar', length: 120 })
  loraKey: string;

  @Column({ type: 'varchar', length: 80, default: 'character' })
  className: string;

  @Column({ type: 'varchar', length: 32, default: 'krea2' })
  modelFamily: AIFinetuneModelFamily;

  @Column({
    type: 'varchar',
    length: 255,
    default: AI_FINETUNE_DEFAULT_BASE_MODELS.krea2,
  })
  baseModel: string;

  @Column({ type: 'varchar', length: 40, default: 'pending' })
  status: AIFinetuneStatus;

  @Column({ type: 'json' })
  datasetImages: AIFinetuneDatasetImage[];

  @Column({ type: 'int', default: 0 })
  datasetImageCount: number;

  @Column({ type: 'json', nullable: true })
  trainingSettings: AIFinetuneTrainingSettings | null;

  @Column({ type: 'json', nullable: true })
  generationDefaults: AIFinetuneGenerationDefaults | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  runpodEndpointId: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  runpodJobId: string | null;

  @Column({ type: 'text', nullable: true })
  loraUrl: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  loraSha256: string | null;

  @Column({ type: 'int', nullable: true })
  loraStep: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  inferenceModel: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'json', nullable: true })
  rawOutput: unknown | null;
}
