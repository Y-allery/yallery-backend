type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export interface RunpodJobResponse {
  id: string;
  status: RunpodJobStatus;
  output?: unknown;
  error?: string;
  delayTime?: number;
  executionTime?: number;
}

export type RunpodOutputType = 'image' | 'video';
