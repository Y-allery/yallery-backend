export const LIKE_SWAGGER = {
  createLike: {
    summary: 'Like a post',
    description: `Add a like to a post. If the post is already liked, the like is removed (toggle behavior). Likes are used for engagement metrics and content ranking.`,
    responses: {
      success: { 
        status: 201, 
        description: 'Like created or removed successfully',
        schema: {
          type: 'object',
          properties: {
            liked: { type: 'boolean' },
            likeCount: { type: 'number' }
          }
        }
      },
      badRequest: { status: 400, description: 'Invalid post ID' },
      notFound: { status: 404, description: 'Post not found' }
    }
  }
};
