import { NotificationGateway } from 'src/notification/notification.gateway';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PostService } from './post.service';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { POST_SWAGGER } from 'src/common/swagger';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/decorators/role.decorator';
import { RoleEnum } from 'src/user/types/role.enum';
import { ReportPostDto } from './dto/report.post.dto';
import { Response } from 'express';
import { MarkViewedDto } from './dto/mark.viewed.dto';
import { TweetDto } from './dto/tweet.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('post')
@ApiTags('Post')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly notificationGateway: NotificationGateway,
    @InjectQueue('tweet-queue') private tweetQueue: Queue,
  ) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getFeed)
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse(POST_SWAGGER.getFeed.responses.success)
  getPosts(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 10,
  ) {
    const cursorNum = cursor ? parseInt(cursor, 10) : null;
    if (isNaN(limit) || limit <= 0) limit = 10;

    return this.postService.getPosts(cursorNum, limit, req.user.id);
  }

  @Get('get-posts-by-tag')
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
  ): Promise<any> {
    return this.postService.findPostsByTag(tagId, page, limit);
  }

  @Patch('publish/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.publishPost)
  @ApiParam({ name: 'id', required: true })
  @ApiResponse(POST_SWAGGER.publishPost.responses.success)
  @ApiResponse(POST_SWAGGER.publishPost.responses.notFound)
  @ApiResponse(POST_SWAGGER.publishPost.responses.forbidden)
  publishPost(@Param('id') id: number, @Req() req: AuthenticatedRequest) {
    return this.postService.publishPost(id, req.user.id);
  }

  @Get('published')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getPublishedPosts)
  @ApiResponse(POST_SWAGGER.getPublishedPosts.responses.success)
  getUnpublishedPosts(@Req() req: AuthenticatedRequest) {
    return this.postService.getPublishedPosts(req.user.id);
  }

  @Get('unpublished')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.getUnpublishedPosts)
  @ApiResponse(POST_SWAGGER.getUnpublishedPosts.responses.success)
  getPublishedPosts(@Req() req: AuthenticatedRequest) {
    return this.postService.getUnpublishedPosts(req.user.id);
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
    await this.postService.markPostsAsViewed(postIds, userId);
    return await this.notificationGateway.emitProfileUpdate(
      req.user.id.toString(),
    );
  }

  @Patch('mark-all-as-unviewed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation(POST_SWAGGER.markAllAsUnviewed)
  @ApiResponse(POST_SWAGGER.markAllAsUnviewed.responses.success)
  async markAllAsUnviewed(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.postService.markAllAsUnviewed(userId);
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
    return this.postService.reportPost(reportDto, req.user.id);
  }

  @Get('download/:id')
  @ApiOperation(POST_SWAGGER.downloadPost)
  @ApiParam({ name: 'id', required: true })
  @ApiResponse(POST_SWAGGER.downloadPost.responses.success)
  @ApiResponse(POST_SWAGGER.downloadPost.responses.notFound)
  async downloadPostImage(@Param('id') id: number, @Res() res: Response) {
    const { buffer, contentType, filename } =
      await this.postService.getPostImageWithWatermark(id);

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
    const result = await this.postService.share(userId);
    return {
      message: result.message,
      pointsAwarded: result.pointsAwarded,
    };
  }

  @Post('tweet')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(POST_SWAGGER.tweet)
  @ApiBody({ type: TweetDto })
  @ApiResponse(POST_SWAGGER.tweet.responses.success)
  @ApiResponse(POST_SWAGGER.tweet.responses.badRequest)
  async tweetImage(@Body() dto: TweetDto, @Req() req: AuthenticatedRequest) {
    await this.tweetQueue.add(
      'tweet',
      { postId: dto.post_id, userId: req.user.id },
      {
        attempts: 4,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { message: 'Tweet request queued successfully' };
  }

  @Post('admin/update-dimensions')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(RoleEnum.ADMIN)
  @ApiOperation({
    summary: 'Update image dimensions in generation_params for all posts',
    description: 'Batch process all posts to get actual image dimensions and update generation_params. Processes posts in batches to avoid blocking event loop.',
  })
  @ApiQuery({ name: 'batchSize', required: false, type: Number, description: 'Number of posts to process in each batch (default: 10)' })
  @ApiQuery({ name: 'delay', required: false, type: Number, description: 'Delay in milliseconds between batches (default: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Batch processing started/completed',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Total posts found' },
        processed: { type: 'number', description: 'Posts processed' },
        updated: { type: 'number', description: 'Posts updated with dimensions' },
        failed: { type: 'number', description: 'Posts that failed to process' },
      },
    },
  })
  async updatePostsDimensions(
    @Query('batchSize') batchSize?: number,
    @Query('delay') delay?: number,
  ) {
    const result = await this.postService.updatePostsDimensionsBatch(
      batchSize ? Number(batchSize) : 10,
      delay ? Number(delay) : 100,
    );
    return result;
  }
}
