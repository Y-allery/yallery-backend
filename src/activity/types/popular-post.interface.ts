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
  generation_params?: {
    prompt?: string;
    ai_service?: string;
    orientation?: 'horizontal' | 'vertical';
    style_id?: number;
    color_id?: number;
    width?: number;
    height?: number;
    negative_prompt?: string;
  } | null;
}

export interface PopularPostsResponse {
  posts: PopularPost[];
  period: 'today' | 'yesterday' | 'all_time' | 'mixed';
  totalCount: number;
}
