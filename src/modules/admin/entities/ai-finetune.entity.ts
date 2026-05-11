import { Column, Entity, Index } from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';

export type AIFinetuneStatus =
  | 'pending'
  | 'queued'
  | 'training'
  | 'ready'
  | 'failed';

export interface AIFinetuneDatasetImage {
  url: string;
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
}

export interface AIFinetuneGenerationDefaults {
  loraScale?: number;
}

@Entity('ai_finetunes')
@Index('IDX_ai_finetunes_loraKey', ['loraKey'], { unique: true })
@Index('IDX_ai_finetunes_status', ['status'])
export class AIFinetuneEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  triggerWord: string;

  @Column({ type: 'varchar', length: 120 })
  loraKey: string;

  @Column({ type: 'varchar', length: 80, default: 'character' })
  className: string;

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

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'json', nullable: true })
  rawOutput: unknown | null;
}
