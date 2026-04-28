import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { RoleEnum } from 'src/user/types/role.enum';
import { BlockPostDto } from '../dto/block.post.dto';
import { BlockUserDto } from '../dto/block.user.dto';
import { AdminModerationService } from '../services/admin-moderation.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminModerationController {
  constructor(
    private readonly adminModerationService: AdminModerationService,
  ) {}

  @Post('block-user')
  async blockUser(@Body() dto: BlockUserDto) {
    return this.adminModerationService.blockUser(dto);
  }

  @Post('block-post')
  async blockPost(@Body() dto: BlockPostDto) {
    return this.adminModerationService.blockPost(dto);
  }

  @Post('unblock-user')
  async unblockUser(@Body() dto: BlockUserDto) {
    return this.adminModerationService.unblockUser(dto);
  }

  @Post('unblock-post')
  async unblockPost(@Body() dto: BlockPostDto) {
    return this.adminModerationService.unblockPost(dto);
  }

  @Delete('reports/:reportId')
  @ApiOperation({ summary: 'Delete a reported post report' })
  @ApiParam({
    name: 'reportId',
    required: true,
    type: Number,
    description: 'The ID of the report to delete',
  })
  @ApiResponse({ status: 200, description: 'Report deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  async deleteReport(@Param('reportId', ParseIntPipe) reportId: number) {
    return this.adminModerationService.deleteReport(reportId);
  }

  @Get('get-all-reports')
  async getAllReports(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    const pagination = { page, limit };
    return this.adminModerationService.getReportPosts(pagination);
  }

  @Get('posts/:postId')
  @ApiOperation({ summary: 'Retrieve a post by its ID with full details' })
  @ApiResponse({ status: 200, description: 'Post retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  async getPostById(@Param('postId', ParseIntPipe) postId: number) {
    return this.adminModerationService.getPostById(postId);
  }
}
