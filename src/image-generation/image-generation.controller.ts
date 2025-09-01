import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { GenerateImageDto } from './dto/generate.image.dto';
import { EditImageDto } from './dto/edit-image.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { RefundCreditDto } from 'src/post/dto/refund.credit.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
@ApiTags('Image Generation')
@Controller('image-generation')
@UseGuards(JwtAuthGuard)
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Post('generate-image')
  @ApiOperation({ 
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

**Supported formats:** Generated as high-quality JPG/PNG images`
  })
  @ApiBody({ 
    type: GenerateImageDto,
    description: 'Image generation parameters including prompt, AI model, orientation, and quantity'
  })
  @ApiResponse({ 
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
  })
  @ApiResponse({ 
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
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - invalid or missing JWT token'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Forbidden - user account issues or service unavailable'
  })
  async generateOctoAI(
    @Body() createPostDto: GenerateImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.imageGenerationService.generateImages(
      createPostDto,
      req.user.id,
    );

    return {
      message: 'Image generation task has been added to the queue.',
    };
  }

  @Post('edit-image')
  @ApiOperation({ 
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

**Supported formats:** JPG, PNG, WebP (via URL)`
  })
  @ApiBody({ 
    type: EditImageDto,
    description: 'Image editing parameters including the source image URL and editing prompt'
  })
  @ApiResponse({ 
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
  })
  @ApiResponse({ 
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
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - invalid or missing JWT token'
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Forbidden - user account issues or service unavailable'
  })
  async editImage(
    @Body() editImageDto: EditImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.imageGenerationService.editImage(
      editImageDto,
      req.user.id,
    );

    return {
      message: 'Image editing task has been added to the queue.',
    };
  }

  @Delete(':id')
  async deletePost(
    @Param('id', ParseIntPipe) postId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.imageGenerationService.deletePost(
      postId,
      req.user.id,
    );
    return result;
  }

  @Get('ai-settings')
  getAllAISettings() {
    return this.imageGenerationService.getAllAISettings();
  }

  @Post('save/:id')
  async markPostAsSaved(
    @Param('id', ParseIntPipe) postId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.imageGenerationService.markPostAsSaved(
      postId,
      req.user.id,
    );
    return result;
  }

  @Post('refund-credits')
  @ApiOperation({ summary: 'Refund credits for generated posts' })
  @ApiBody({ type: RefundCreditDto })
  @ApiResponse({ status: 200, description: 'Credits refunded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async refundCredits(
    @Body() dto: RefundCreditDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;

    return await this.imageGenerationService.calculateRefundCredits(
      userId,
      dto.posts,
      dto.ai_service,
    );
  }
}
