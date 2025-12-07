export const TAG_SWAGGER = {
  findAll: {
    summary: 'Get all tags',
    description: `Retrieve all available tags in the system. Tags are used for categorizing content and personalizing user experience.`,
    responses: {
      success: { status: 200, description: 'Tags retrieved successfully' }
    }
  },
  searchByName: {
    summary: 'Search tags by name',
    description: `Search for tags by name with autocomplete functionality. Returns matching tags based on partial name match.`,
    responses: {
      success: { status: 200, description: 'Matching tags retrieved successfully' }
    }
  },
  assignTagToPost: {
    summary: 'Assign tag to post',
    description: `Associate a tag with a specific post. Tags help organize and categorize content for better discoverability.`,
    responses: {
      success: { status: 200, description: 'Tag assigned successfully' },
      badRequest: { status: 400, description: 'Invalid request' },
      forbidden: { status: 403, description: 'Forbidden - cannot tag others posts' },
      notFound: { status: 404, description: 'Post or tag not found' }
    }
  }
};
