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
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
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
  @ApiQuery({ name: 'page', required: true })
  @ApiQuery({ name: 'limit', required: true })
  @ApiQuery({ name: 'tagId', required: true })
  async getPostsByTag(
    @Query('tagId') tagId: number,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<any> {
    return this.postService.findPostsByTag(tagId, page, limit);
  }

  @Patch('publish/:id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id', required: true })
  publishPost(@Param('id') id: number, @Req() req: AuthenticatedRequest) {
    return this.postService.publishPost(id, req.user.id);
  }

  @Get('published')
  @UseGuards(JwtAuthGuard)
  getUnpublishedPosts(@Req() req: AuthenticatedRequest) {
    return this.postService.getPublishedPosts(req.user.id);
  }

  @Get('unpublished')
  @UseGuards(JwtAuthGuard)
  getPublishedPosts(@Req() req: AuthenticatedRequest) {
    return this.postService.getUnpublishedPosts(req.user.id);
  }

  @Patch('mark-viewed')
  @UseGuards(JwtAuthGuard)
  @ApiBody({ type: MarkViewedDto })
  @ApiResponse({ status: 200, description: 'Posts marked as viewed' })
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
  async markAllAsUnviewed(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.postService.markAllAsUnviewed(userId);
  }

  @Post('report')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a post' })
  @ApiBody({ type: ReportPostDto })
  @ApiResponse({ status: 201, description: 'Post reported successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async reportPost(
    @Body() reportDto: ReportPostDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.postService.reportPost(reportDto, req.user.id);
  }

  @Get('download/:id')
  @ApiParam({ name: 'id', required: true })
  @ApiOperation({ summary: 'Download post image with watermark' })
  async downloadPostImage(@Param('id') id: number, @Res() res: Response) {
    const imageBuffer = await this.postService.getPostImageWithWatermark(id);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="post_${id}.png"`,
    });

    res.send(imageBuffer);
  }

  @Post('share')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Share to earn daily points' })
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
  async tweetImage(@Body() dto: TweetDto, @Req() req: AuthenticatedRequest) {
    await this.tweetQueue.add(
      'tweet',
      { postId: dto.post_id, userId: req.user.id },
      {
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { message: 'Tweet request queued successfully' };
  }
}
