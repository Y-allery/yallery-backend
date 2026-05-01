export interface AudioGenerationResult {
  videoUrl: string;
  previewImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  rawOutput?: unknown;
}
