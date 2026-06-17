import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { PostPublishService } from './services/post-publish.service';

/**
 * Compatibility controller for the mobile app's legacy `image-generation/*`
 * routes. The generation API was consolidated under `media-generation`, but the
 * shipped app still deletes a generated item via `DELETE /image-generation/:id`
 * (post_repository.deleteMedia -> APIUrls.deleteGeneratedImage). This serves
 * that path so the app's delete works without requiring a new mobile release.
 */
@ApiTags('Image Generation (legacy compat)')
@Controller('image-generation')
export class ImageGenerationCompatController {
  constructor(private readonly postPublishService: PostPublishService) {}

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a generated media item (own post)',
    description:
      'Permanently deletes a post owned by the caller (published or draft). Related likes, views, reports and activity are removed by database cascade. Matches the mobile app’s DELETE /image-generation/:id call.',
  })
  @ApiParam({ name: 'id', required: true, description: 'Post / generated media ID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found or not owner' })
  async deleteGeneratedImage(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.postPublishService.deletePost(id, req.user.id);
  }
}
