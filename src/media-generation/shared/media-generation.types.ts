export enum MediaGenerationModality {
  IMAGE = 'image',
}

export enum MediaGenerationProvider {
  RUNPOD = 'runpod',
}

export enum MediaGenerationRequestStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum MediaGenerationDeliveryEventType {
  IMAGE_GENERATION_FAILED = 'imageGenerationFailed',
}

export interface MediaGenerationErrorDeliveryPayload {
  requestId: string;
  error: string;
  modality: MediaGenerationModality;
}
