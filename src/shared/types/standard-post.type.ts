/**
 * Standard post type that matches the backend format
 * All post endpoints return this standardized format
 */
export interface StandardPost {
  id: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  previewImageUrl: string | null;
  hasAudio: boolean | null;
  likeCount: number | null;
  viewCount: number | null;
  createdAt: Date | string | null;
  userId: number | null;
  username: string | null;
  tagName: string | null;
  tagId: number | null;
  isPublished: boolean | null;
  isLiked: boolean | null;
  isViewed: boolean | null;
  generationParams: {
    prompt?: string | null;
    translatedPrompt?: string | null;
    resolvedPrompt?: string | null;
    aiService?: string | null;
    orientation?: 'horizontal' | 'vertical' | null;
    styleId?: number | null;
    styleName?: string | null;
    colorId?: number | null;
    colorName?: string | null;
    width?: number | null;
    height?: number | null;
    negativePrompt?: string | null;
    memeId?: number | null;
    sourceImageUrl?: string | null;
    sourceVideoUrl?: string | null;
    memeName?: string | null;
    characterOrientation?: 'image' | 'video' | null;
  } | null;
}
