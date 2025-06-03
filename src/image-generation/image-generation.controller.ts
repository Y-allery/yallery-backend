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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
@ApiTags('Image Generation')
@Controller('image-generation')
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
}
