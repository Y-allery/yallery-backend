export interface PopularPost {
  id: number;
  imageUrl: string | null;
  videoUrl: string | null;
  previewImageUrl: string | null;
  likeCount: number;
  viewCount: number;
  createdAt: Date;
  userId: number;
  username: string;
  tagName: string | null;
  tagId: number | null;
  isPublished: boolean;
  isBlocked: boolean;
  isRejected: boolean;
  isLiked: boolean;
  isViewed: boolean;
  generationParams?: {
    prompt?: string;
    aiService?: string;
    orientation?: 'horizontal' | 'vertical';
    width?: number | null;
    height?: number | null;
  } | null;
}

export interface PopularPostsResponse {
  posts: PopularPost[];
  period: 'today' | 'yesterday' | 'all_time' | 'mixed';
  totalCount: number;
}
