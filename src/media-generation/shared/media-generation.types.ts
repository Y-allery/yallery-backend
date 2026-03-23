export enum MediaGenerationModality {
  IMAGE = 'image',
  AUDIO = 'audio',
}

export enum MediaGenerationProvider {
  RUNPOD = 'runpod',
  FAL = 'fal',
}

export enum MediaGenerationRequestStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum MediaGenerationDeliveryEventType {
  IMAGE_GENERATION_FAILED = 'imageGenerationFailed',
  AUDIO_GENERATION_FAILED = 'audioGenerationFailed',
}

export interface MediaGenerationErrorDeliveryPayload {
  requestId: string;
  error: string;
  modality: MediaGenerationModality;
}
