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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { RefundCreditDto } from 'src/post/dto/refund.credit.dto';
@ApiTags('Image Generation')
@Controller('image-generation') //sd
@UseGuards(JwtAuthGuard)
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Post('generate-image')
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
