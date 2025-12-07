/**
 * Swagger documentation descriptions for Image Generation Controller
 */

export const IMAGE_GENERATION_SWAGGER = {
  generateImage: {
    summary: 'Generate images using various AI models',
    description: `Generate high-quality images using multiple AI models including Aura Flow, Flux, Realistic Vision, and Flux Pro Fine-tune. Each model offers unique capabilities for different artistic styles and use cases.

**Available AI Models:**
- **Aura Flow**: Creates artistic and stylized images with unique visual effects
- **Flux**: Generates high-quality images with balanced realism and creativity
- **Realistic Vision**: Produces photorealistic images with exceptional detail
- **Flux Pro Fine-tune**: Advanced model with enhanced customization options
- **Bytedance Edit**: Specialized for image editing (use edit-image endpoint)

**Features:**
- Multiple AI model options for different artistic styles
- Customizable orientation (horizontal/vertical)
- Optional style and color customization
- Batch generation (1-10 images per request)
- Automatic tag selection capability
- Contest and tag integration

**Process:**
1. Uploads the generation task to a background queue
2. Processes the request using the selected AI model
3. Saves generated images to your gallery
4. Sends notification when complete

**Cost:** Varies by AI model (typically 1-3 credits per image)

**Supported formats:** Generated as high-quality JPG/PNG images`,
    responses: {
      success: {
        status: 201,
        description: 'Image generation task has been successfully added to the queue. The generated images will be processed in the background and saved to your gallery.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Image generation task has been added to the queue.'
            }
          }
        }
      },
      badRequest: {
        status: 400,
        description: 'Invalid request - check your input parameters or insufficient credits',
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Insufficient credits or invalid parameters' },
            error: { type: 'string', example: 'Bad Request' }
          }
        }
      },
      unauthorized: { status: 401, description: 'Unauthorized - invalid or missing JWT token' },
      forbidden: { status: 403, description: 'Forbidden - user account issues or service unavailable' }
    }
  },
  editImage: {
    summary: 'Edit an existing image using Bytedance SeedEdit AI',
    description: `Edit an existing image using Bytedance's SeedEdit 3.0 model. This AI excels in accurately following editing instructions and effectively preserving image content, especially for real images.

**Features:**
- Uses Bytedance SeedEdit 3.0 model
- Preserves original image content while applying edits
- Supports detailed editing instructions
- Returns high-quality edited images

**Process:**
1. Uploads the task to a background queue
2. Processes the image using AI
3. Saves the result to your gallery
4. Sends notification when complete

**Cost:** 1 credit per edit

**Supported formats:** JPG, PNG, WebP (via URL)`,
    responses: {
      success: {
        status: 201,
        description: 'Image editing task has been successfully added to the queue. The edited image will be processed in the background and saved to your gallery.',
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Image editing task has been added to the queue.'
            }
          }
        }
      },
      badRequest: {
        status: 400,
        description: 'Invalid request - check your input parameters or insufficient credits',
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Insufficient credits or invalid parameters' },
            error: { type: 'string', example: 'Bad Request' }
          }
        }
      },
      unauthorized: { status: 401, description: 'Unauthorized - invalid or missing JWT token' },
      forbidden: { status: 403, description: 'Forbidden - user account issues or service unavailable' }
    }
  },
  deletePost: {
    summary: 'Delete generated post',
    description: `Permanently delete a generated image post from your gallery. This action cannot be undone.`,
    responses: {
      success: { status: 200, description: 'Post deleted successfully' },
      notFound: { status: 404, description: 'Post not found' },
      forbidden: { status: 403, description: 'Forbidden - you can only delete your own posts' }
    }
  },
  getAllAISettings: {
    summary: 'Get all AI model settings',
    description: `Retrieve all available AI models and their configuration settings including pricing, capabilities, and supported options.`,
    responses: {
      success: { status: 200, description: 'AI settings retrieved successfully' }
    }
  },
  markPostAsSaved: {
    summary: 'Save post to favorites',
    description: `Mark a post as saved/favorited for easy access later.`,
    responses: {
      success: { status: 200, description: 'Post marked as saved' },
      notFound: { status: 404, description: 'Post not found' }
    }
  },
  refundCredits: {
    summary: 'Refund credits for generated posts',
    description: `Calculate and request refund for credits spent on generated posts. Used when posts fail to generate or are deleted.`,
    responses: {
      success: { status: 200, description: 'Credits refunded successfully' },
      badRequest: { status: 400, description: 'Invalid request - posts not eligible for refund' }
    }
  }
};
