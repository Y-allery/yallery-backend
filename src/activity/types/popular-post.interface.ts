export interface PopularPost {
  id: number;
  imageUrl: string | null;
  videoUrl: string | null;
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
}

export interface PopularPostsResponse {
  posts: PopularPost[];
  period: 'today' | 'yesterday' | 'all_time' | 'mixed';
  totalCount: number;
}
