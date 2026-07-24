export interface UploadedVideoAsset {
  videoUrl: string;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
  /** SHA-256 of the provider bytes uploaded to durable public video storage. */
  sourceSha256?: string;
}

export interface StagedPrivateVideoAsset {
  privateArtifactRef: string;
  byteLength: number;
  sourceSha256: string;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
}
