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
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { RefundCreditDto } from 'src/post/dto/refund.credit.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { IMAGE_GENERATION_SWAGGER } from 'src/common/swagger';
@ApiTags('Image Generation')
@Controller('image-generation')
@UseGuards(JwtAuthGuard)
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Post('generate-image')
  @ApiOperation(IMAGE_GENERATION_SWAGGER.generateImage)
  @ApiBody({ 
    type: GenerateImageDto,
    description: 'Image generation parameters including prompt, AI model, orientation, and quantity'
  })
  @ApiResponse(IMAGE_GENERATION_SWAGGER.generateImage.responses.success)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.generateImage.responses.badRequest)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.generateImage.responses.unauthorized)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.generateImage.responses.forbidden)
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
  @ApiOperation(IMAGE_GENERATION_SWAGGER.editImage)
  @ApiBody({ 
    type: EditImageDto,
    description: 'Image editing parameters including the source image URL and editing prompt'
  })
  @ApiResponse(IMAGE_GENERATION_SWAGGER.editImage.responses.success)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.editImage.responses.badRequest)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.editImage.responses.unauthorized)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.editImage.responses.forbidden)
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
  @ApiOperation(IMAGE_GENERATION_SWAGGER.deletePost)
  @ApiParam({ name: 'id', type: Number, description: 'Post ID to delete' })
  @ApiResponse(IMAGE_GENERATION_SWAGGER.deletePost.responses.success)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.deletePost.responses.notFound)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.deletePost.responses.forbidden)
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
  @ApiOperation(IMAGE_GENERATION_SWAGGER.getAllAISettings)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.getAllAISettings.responses.success)
  getAllAISettings() {
    return this.imageGenerationService.getAllAISettings();
  }

  @Post('save/:id')
  @ApiOperation(IMAGE_GENERATION_SWAGGER.markPostAsSaved)
  @ApiParam({ name: 'id', type: Number, description: 'Post ID to save' })
  @ApiResponse(IMAGE_GENERATION_SWAGGER.markPostAsSaved.responses.success)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.markPostAsSaved.responses.notFound)
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
  @ApiOperation(IMAGE_GENERATION_SWAGGER.refundCredits)
  @ApiBody({ type: RefundCreditDto })
  @ApiResponse(IMAGE_GENERATION_SWAGGER.refundCredits.responses.success)
  @ApiResponse(IMAGE_GENERATION_SWAGGER.refundCredits.responses.badRequest)
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
