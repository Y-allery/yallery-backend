export const POST_SWAGGER = {
  getFeed: {
    summary: 'Get posts feed',
    description: `Retrieve a paginated feed of posts. Uses cursor-based pagination for efficient loading. Posts are ordered by creation date (newest first).`,
    responses: {
      success: { 
        status: 200, 
        description: 'Posts feed retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            posts: { type: 'array', items: { type: 'object' } },
            nextCursor: { type: 'string', nullable: true },
            hasMore: { type: 'boolean' }
          }
        }
      }
    }
  },
  getPostsByTag: {
    summary: 'Get posts by tag',
    description: `Retrieve posts filtered by a specific tag. Supports pagination with page and limit parameters.`,
    responses: {
      success: { status: 200, description: 'Posts retrieved successfully' },
      notFound: { status: 404, description: 'Tag not found' }
    }
  },
  publishPost: {
    summary: 'Publish post',
    description: `Make a previously generated post publicly visible in the feed.`,
    responses: {
      success: { status: 200, description: 'Post published successfully' },
      notFound: { status: 404, description: 'Post not found' },
      forbidden: { status: 403, description: 'You can only publish your own posts' }
    }
  },
  getPublishedPosts: {
    summary: 'Get published posts',
    description: `Retrieve paginated published posts for the authenticated user. Use page and limit query params for pagination.`,
    responses: {
      success: {
        status: 200,
        description: 'Published posts retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            total: { type: 'number', description: 'Total count of posts' },
            page: { type: 'number', description: 'Current page number' },
            limit: { type: 'number', description: 'Items per page' },
            totalPages: { type: 'number', description: 'Total number of pages' },
          },
        },
      },
    },
  },
  getUnpublishedPosts: {
    summary: 'Get unpublished posts',
    description: `Retrieve paginated unpublished (draft) posts for the authenticated user. Use page and limit query params for pagination.`,
    responses: {
      success: {
        status: 200,
        description: 'Unpublished posts retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            total: { type: 'number', description: 'Total count of posts' },
            page: { type: 'number', description: 'Current page number' },
            limit: { type: 'number', description: 'Items per page' },
            totalPages: { type: 'number', description: 'Total number of pages' },
          },
        },
      },
    },
  },
  getPopularPosts: {
    summary: 'Get popular posts',
    description: `Retrieve up to 6 popular posts ranked by likes and views, preferring today, then yesterday, then all-time results.`,
    responses: {
      success: { status: 200, description: 'Popular posts retrieved successfully' },
    },
  },
  markPostsAsViewed: {
    summary: 'Mark posts as viewed',
    description: `Mark multiple posts as viewed by the user. Used for tracking user engagement and read status.`,
    responses: {
      success: { status: 200, description: 'Posts marked as viewed successfully' }
    }
  },
  markAllAsUnviewed: {
    summary: 'Mark all posts as unviewed',
    description: `Reset view status for all posts. Useful for testing or resetting engagement metrics.`,
    responses: {
      success: { status: 200, description: 'All posts marked as unviewed' }
    }
  },
  reportPost: {
    summary: 'Report a post',
    description: `Submit a report for inappropriate content. Reports are reviewed by moderators.`,
    responses: {
      success: { status: 201, description: 'Post reported successfully' },
      badRequest: { status: 400, description: 'Invalid report reason or already reported' },
      forbidden: { status: 403, description: 'Cannot report your own post' }
    }
  },
  downloadPost: {
    summary: 'Download post with watermark',
    description: `Download a post image or video with a watermark applied. Returns the file as a download.`,
    responses: {
      success: { 
        status: 200, 
        description: 'File download started',
        content: {
          'image/jpeg': { schema: { type: 'string', format: 'binary' } },
          'image/png': { schema: { type: 'string', format: 'binary' } },
          'video/mp4': { schema: { type: 'string', format: 'binary' } }
        }
      },
      notFound: { status: 404, description: 'Post not found' }
    }
  },
  share: {
    summary: 'Share to earn daily points',
    description: `Record a share action to earn daily reward points. Can be used once per day.`,
    responses: {
      success: { 
        status: 200, 
        description: 'Share recorded successfully',
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            pointsAwarded: { type: 'number' }
          }
        }
      },
      badRequest: { status: 400, description: 'Already shared today' }
    }
  }
};
