/**
 * Standard post type that matches the backend format
 * All post endpoints return this standardized format
 */
export interface StandardPost {
  id: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  previewImageUrl: string | null;
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
    aiService?: string | null;
    orientation?: 'horizontal' | 'vertical' | null;
    width?: number | null;
    height?: number | null;
    suggestedTags?: { id: number | null; name: string | null }[] | null;
  } | null;
}




