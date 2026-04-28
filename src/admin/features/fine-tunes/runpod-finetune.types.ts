import { AIFinetuneStatus } from '../../entities/ai-finetune.entity';

export type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export interface RunpodJobResponse {
  id: string;
  status: RunpodJobStatus;
  output?: any;
  error?: string;
}

export function mapRunpodStatusToFineTuneStatus(
  status: RunpodJobStatus,
): AIFinetuneStatus {
  if (status === 'COMPLETED') return 'ready';
  if (status === 'IN_PROGRESS') return 'training';
  if (status === 'IN_QUEUE') return 'queued';
  return 'failed';
}
