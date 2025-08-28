import { ApiProperty } from '@nestjs/swagger';
import { PopularPost, PopularPostsResponse } from '../types/popular-post.interface';

export class PopularPostDto implements PopularPost {
  @ApiProperty({ description: 'Post ID' })
  id: number;

  @ApiProperty({ description: 'Image URL', nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: 'Video URL', nullable: true })
  videoUrl: string | null;

  @ApiProperty({ description: 'Number of likes' })
  likeCount: number;

  @ApiProperty({ description: 'Number of views' })
  viewCount: number;

  @ApiProperty({ description: 'Post creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'User ID who created the post' })
  userId: number;

  @ApiProperty({ description: 'Username who created the post' })
  username: string;

  @ApiProperty({ description: 'Tag name', nullable: true })
  tagName: string | null;

  @ApiProperty({ description: 'Tag ID', nullable: true })
  tagId: number | null;

  @ApiProperty({ description: 'Is post published' })
  isPublished: boolean;

  @ApiProperty({ description: 'Is post blocked' })
  isBlocked: boolean;

  @ApiProperty({ description: 'Is post rejected' })
  isRejected: boolean;

  @ApiProperty({ description: 'Is post liked by current user' })
  isLiked: boolean;
}

export class PopularPostsResponseDto implements PopularPostsResponse {
  @ApiProperty({ description: 'Array of popular posts', type: [PopularPostDto] })
  posts: PopularPostDto[];

  @ApiProperty({ description: 'Period for which posts were fetched' })
  period: 'today' | 'yesterday' | 'all_time';

  @ApiProperty({ description: 'Total count of posts found' })
  totalCount: number;
}
