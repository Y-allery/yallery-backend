export type UploadV2ResourceType = 'image' | 'video' | 'raw' | 'auto';

export interface UploadV2BufferParams {
  buffer: Buffer;
  mimetype?: string;
  folder?: string;
  resourceType?: UploadV2ResourceType;
  publicId?: string;
}

export interface UploadV2RemoteUrlParams {
  sourceUrl: string;
  folder?: string;
  resourceType?: UploadV2ResourceType;
  publicId?: string;
}

export interface CreateSignedUploadParamsOptions {
  folder?: string;
  publicId?: string;
  resourceType?: UploadV2ResourceType;
}

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
  publicId?: string;
  resourceType?: UploadV2ResourceType;
}
