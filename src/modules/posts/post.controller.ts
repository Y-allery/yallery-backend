import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { POST_SWAGGER } from 'src/shared/swagger';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RateLimit, RateLimitGuard } from 'src/core/guards/rate-limit.guard';
import { ReportPostDto } from './dto/report.post.dto';
import { Response } from 'express';
import { MarkViewedDto } from './dto/mark.viewed.dto';
import { UpdatePostMediaDto } from './dto/update-post-media.dto';
import { PopularPostsResponseDto } from './dto/popular-posts.dto';
import { PostDownloadService } from './services/post-download.service';
import { PostFeedService } from './services/post-feed.service';
import { PostModerationService } from './services/post-moderation.service';
import { PostPublishService } from './services/post-publish.service';
import { PostViewStateService } from './services/post-view-state.service';

@Controller('post')
@ApiTags('Post')
export class PostController {
  constructor(
    private readonly postFeedService: PostFeedService,
    private readonly postPublishService: PostPublishService,
    private readonly postViewStateService: PostViewStateService,
    private readonly postModerationService: PostModerationService,
    private readonly postDownloadService: PostDownloadService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getFeed)
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'tagId', required: false, type: Number, description: 'Optional tag filter for feed' })
  @ApiResponse(POST_SWAGGER.getFeed.responses.success)
  getPosts(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 10,
    @Query('tagId') tagId?: string,
  ) {
    const cursorNum = cursor ? parseInt(cursor, 10) : null;
    if (isNaN(limit) || limit <= 0) limit = 10;

    const tagIdNum = tagId != null ? parseInt(tagId, 10) : null;
    const tagFilter = tagIdNum != null && !isNaN(tagIdNum) && tagIdNum > 0 ? tagIdNum : null;
    return this.postFeedService.getPosts(cursorNum, limit, req.user.id, tagFilter);
  }

  @Get('get-posts-by-tag')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getPostsByTag)
  @ApiQuery({ name: 'page', required: true })
  @ApiQuery({ name: 'limit', required: true })
  @ApiQuery({ name: 'tagId', required: true })
  @ApiResponse(POST_SWAGGER.getPostsByTag.responses.success)
  @ApiResponse(POST_SWAGGER.getPostsByTag.responses.notFound)
  async getPostsByTag(
    @Query('tagId') tagId: number,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.postFeedService.findPostsByTag(tagId, page, limit, req.user.id);
  }

  @Patch('publish/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.publishPost)
  @ApiParam({ name: 'id', required: true })
  @ApiResponse(POST_SWAGGER.publishPost.responses.success)
  @ApiResponse(POST_SWAGGER.publishPost.responses.notFound)
  @ApiResponse(POST_SWAGGER.publishPost.responses.forbidden)
  publishPost(@Param('id') id: number, @Req() req: AuthenticatedRequest) {
    return this.postPublishService.publishPost(id, req.user.id);
  }

  @Patch('update-media/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update post media',
    description: 'Update image URL or video URL (and optional previewImageUrl) of an existing post. Provide either imageUrl or videoUrl, not both. Only the post owner can update.',
  })
  @ApiParam({ name: 'id', required: true, description: 'Post ID' })
  @ApiBody({ type: UpdatePostMediaDto })
  @ApiResponse({ status: 200, description: 'Post media updated successfully' })
  @ApiResponse({ status: 400, description: 'Provide imageUrl or videoUrl (not both)' })
  @ApiResponse({ status: 404, description: 'Post not found or not owner' })
  async updatePostMedia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.postPublishService.updatePostMedia(id, req.user.id, dto);
  }

  @Get('published')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getPublishedPosts)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page' })
  @ApiResponse(POST_SWAGGER.getPublishedPosts.responses.success)
  getPublishedPosts(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.postFeedService.getPublishedPosts(
      req.user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @Get('unpublished')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getUnpublishedPosts)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page' })
  @ApiResponse(POST_SWAGGER.getUnpublishedPosts.responses.success)
  getUnpublishedPosts(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.postFeedService.getUnpublishedPosts(
      req.user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @Get('popular-posts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getPopularPosts)
  @ApiResponse({
    status: 200,
    description: 'Popular posts retrieved successfully',
    type: PopularPostsResponseDto,
  })
  async getPopularPosts(
    @Req() req: AuthenticatedRequest,
  ): Promise<PopularPostsResponseDto> {
    return await this.postFeedService.getPopularPosts(req.user.id);
  }

  @Patch('mark-viewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.markPostsAsViewed)
  @ApiBody({ type: MarkViewedDto })
  @ApiResponse(POST_SWAGGER.markPostsAsViewed.responses.success)
  @HttpCode(HttpStatus.OK)
  async markPostsAsViewed(
    @Body() markViewedDto: MarkViewedDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    const postIds = markViewedDto.ids;
    const result = await this.postViewStateService.markPostsAsViewed(
      postIds,
      userId,
    );
    if (result.markedCount > 0) {
      await this.notificationGateway.emitProfileUpdate(
        req.user.id.toString(),
      );
    }
    return result;
  }

  @Patch('mark-all-as-unviewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.markAllAsUnviewed)
  @ApiResponse(POST_SWAGGER.markAllAsUnviewed.responses.success)
  async markAllAsUnviewed(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.postViewStateService.markAllAsUnviewed(userId);
  }

  @Post('report')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(POST_SWAGGER.reportPost)
  @ApiBody({ type: ReportPostDto })
  @ApiResponse(POST_SWAGGER.reportPost.responses.success)
  @ApiResponse(POST_SWAGGER.reportPost.responses.badRequest)
  @ApiResponse(POST_SWAGGER.reportPost.responses.forbidden)
  async reportPost(
    @Body() reportDto: ReportPostDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.postModerationService.reportPost(reportDto, req.user.id);
  }

  @Get('download/:id')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60000, keyPrefix: 'post-download' })
  @ApiOperation(POST_SWAGGER.downloadPost)
  @ApiParam({ name: 'id', required: true })
  @ApiResponse(POST_SWAGGER.downloadPost.responses.success)
  @ApiResponse(POST_SWAGGER.downloadPost.responses.notFound)
  async downloadPostImage(@Param('id') id: number, @Res() res: Response) {
    const { buffer, contentType, filename } =
      await this.postDownloadService.getPostImageWithWatermark(id);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    res.send(buffer);
  }

  @Post('share')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.share)
  @ApiResponse(POST_SWAGGER.share.responses.success)
  @ApiResponse(POST_SWAGGER.share.responses.badRequest)
  async share(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const result = await this.postPublishService.share(userId);
    return {
      message: result.message,
      pointsAwarded: result.pointsAwarded,
    };
  }

}
