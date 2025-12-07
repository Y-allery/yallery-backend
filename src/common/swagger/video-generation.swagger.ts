export const VIDEO_GENERATION_SWAGGER = {
  getAllAISettings: {
    summary: 'Get video AI settings',
    description: `Retrieve all available video generation AI models and their configuration settings including pricing, capabilities, and supported options.`,
    responses: {
      success: { status: 200, description: 'AI settings retrieved successfully' }
    }
  },
  generateVideo: {
    summary: 'Generate video using AI',
    description: `Generate high-quality videos using AI models. The generation process runs asynchronously in a background queue.

**Process:**
1. Request is added to generation queue
2. Video is generated using selected AI model
3. Generated video is saved to user gallery
4. Notification is sent when complete

**Cost:** Varies by AI model (typically 3-10 credits per video)

**Supported formats:** MP4, MOV`,
    responses: {
      success: { 
        status: 201, 
        description: 'Video generation task added to queue',
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Video generation task has been added to the queue.' }
          }
        }
      },
      badRequest: { status: 400, description: 'Invalid parameters or insufficient credits' },
      unauthorized: { status: 401, description: 'Unauthorized' },
      forbidden: { status: 403, description: 'Forbidden' }
    }
  }
};
