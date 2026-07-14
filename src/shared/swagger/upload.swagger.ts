export const UPLOAD_SWAGGER = {
  uploadImage: {
    summary: 'Upload image',
    description: `Upload an image file to the cloud storage. Returns a public URL for the uploaded image. Supports common image formats (JPG, PNG, WebP, GIF).`,
    responses: {
      success: { 
        status: 200, 
        description: 'Image uploaded successfully',
        schema: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string', example: 'https://cdn.example.com/image.jpg' }
          }
        }
      },
      badRequest: { status: 400, description: 'No file provided or invalid file type' },
      internalError: { status: 500, description: 'Failed to upload image' }
    }
  },
  uploadVideo: {
    summary: 'Upload video',
    description: `Upload a video file (MP4, MOV, WebM) to Spaces storage. Returns a public media-proxy URL for the uploaded video.`,
    responses: {
      success: {
        status: 200,
        description: 'Video uploaded successfully',
        schema: {
          type: 'object',
          properties: {
            videoUrl: { type: 'string', example: 'https://api.example.com/media/video/upload/octoai_videos/video.mp4' }
          }
        }
      },
      badRequest: { status: 400, description: 'No file provided or invalid file type' },
      internalError: { status: 500, description: 'Failed to upload video' }
    }
  }
};
