export interface UploadedVideoAsset {
  videoUrl: string;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
}
