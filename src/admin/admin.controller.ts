import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { RoleEnum } from 'src/user/types/role.enum';
import { CreateContestDto } from './dto/create-contest.dto';
import { AdminService } from './admin.service';
import { BlockUserDto } from './dto/block.user.dto';
import { BlockPostDto } from './dto/block.post.dto';
import { SetContestWinnerDto } from './dto/set.contest.winner.dto';
import { CreateTagDto } from 'src/tag/dto/create.tag.dto';
import { UpdateTagDto } from 'src/tag/dto/update.tag.dto';
import { UpdateContestDto } from 'src/contest/dto/update.contest.dto';
import { CreateStyleDto } from 'src/post/dto/create.style.dto';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';
import { PaginatioDto } from 'src/common/dto/pagination.dto';
import { CreatePartnershipDto } from './dto/create.refferal.dto';
import { ForceStartContestDto } from './dto/force-start-contest.dto';
@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create-contest')
  async createContest(@Body() dto: CreateContestDto) {
    return this.adminService.createAdminContest(dto);
  }

  @Get('contests')
  @ApiOperation({ summary: 'Retrieve contests by status or all contests' })
  @ApiResponse({
    status: 200,
    description: 'Contests retrieved successfully.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter contests by status (open or closed)',
    enum: ContestStatusEnum,
  })
  async getAllContests(
    @Query('status') status?: ContestStatusEnum,
  ): Promise<any[]> {
    return this.adminService.findAllContests(status);
  }
  @Put('contests/:id')
  @ApiOperation({ summary: 'Update a contest' })
  @ApiResponse({ status: 200, description: 'Contest updated successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async updateContest(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContestDto: UpdateContestDto,
  ) {
    return this.adminService.updateContest(id, updateContestDto);
  }

  @Delete('contests/:id')
  @ApiOperation({ summary: 'Delete a contest' })
  @ApiResponse({ status: 200, description: 'Contest deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Contest not found.' })
  async deleteContest(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteContest(id);
  }

  @Post('block-user')
  async blockUser(@Body() dto: BlockUserDto) {
    return this.adminService.blockUser(dto);
  }

  @Post('block-post')
  async blockPost(@Body() dto: BlockPostDto) {
    return this.adminService.blockPost(dto);
  }

  @Post('unblock-user')
  async unblockUser(@Body() dto: BlockUserDto) {
    return this.adminService.unblockUser(dto);
  }

  @Post('unblock-post')
  async unblockPost(@Body() dto: BlockPostDto) {
    return this.adminService.unblockPost(dto);
  }

  @Get('pending-review-contests')
  async getPendingReviewContests() {
    return this.adminService.getPendingReviewContests();
  }

  @Get('contests/posts-sorted-by-likes')
  @ApiOperation({ summary: 'Get all posts for a contest sorted by likes' })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved and sorted by likes successfully.',
  })
  async getPostsByContestSortedByLikes() {
    return this.adminService.getPostsByContestSortedByLikes();
  }

  @Post('set-contest-winner')
  async setContestWinner(@Body() dto: SetContestWinnerDto) {
    return this.adminService.setContestWinner(dto);
  }

  @Post('reject-contest-winner')
  @ApiOperation({ summary: 'Reject a contest winner' })
  @ApiResponse({
    status: 200,
    description: 'Contest winner rejected successfully.',
  })
  @ApiResponse({ status: 404, description: 'Post or contest not found.' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters.' })
  async rejectContestWinner(@Body() dto: SetContestWinnerDto) {
    return this.adminService.rejectContestWinner(dto);
  }

  @Get('get-admin-active-notifications')
  async getAdminActiveNotifications(@Query() dto: PaginatioDto) {
    return this.adminService.getAdminActiveNottifications(dto);
  }

  @Get('get-admin-archive-notifications')
  async getAdminArchiveNotifications(@Query() dto: PaginatioDto) {
    return this.adminService.getAdminArchiveNottifications(dto);
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
    return this.adminService.deleteReport(reportId);
  }

  @Get('get-all-reports')
  async getAllReports(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    const pagination = { page, limit };
    return this.adminService.getReportPosts(pagination);
  }

  @Get('users')
  async getUsers(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    return this.adminService.getUsers({ page, limit });
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all tags' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all tags.' })
  async getTags() {
    return this.adminService.getAllTags();
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create tag' })
  async createTag(@Body() createTagDto: CreateTagDto) {
    return this.adminService.createTag(createTagDto);
  }

  @Put('tags/:id')
  @ApiOperation({ summary: 'Update tag' })
  async updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.adminService.updateTag(id, updateTagDto);
  }

  @Delete('tags/:id')
  @ApiOperation({ summary: 'Delete tag' })
  async deleteTag(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteTag(id);
  }

  @Post('styles')
  @ApiOperation({ summary: 'Create a new style' })
  @ApiResponse({ status: 201, description: 'Style created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  async createStyle(@Body() createStyleDto: CreateStyleDto) {
    return this.adminService.createStyle(createStyleDto);
  }

  @Get('styles')
  @ApiOperation({ summary: 'Retrieve all styles' })
  @ApiResponse({ status: 200, description: 'Styles retrieved successfully.' })
  async getStyles() {
    return this.adminService.findAllStyles();
  }

  @Get('styles/:id')
  @ApiOperation({ summary: 'Retrieve a style by ID' })
  @ApiResponse({ status: 200, description: 'Style retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async getStyle(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.findStyleById(id);
  }

  @Put('styles/:id')
  @ApiOperation({ summary: 'Update a style' })
  @ApiResponse({ status: 200, description: 'Style updated successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async updateStyle(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: CreateStyleDto,
  ) {
    return this.adminService.updateStyle(id, updateTagDto);
  }

  @Delete('styles/:id')
  @ApiOperation({ summary: 'Delete a style' })
  @ApiResponse({ status: 200, description: 'Style deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async deleteStyle(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteStyle(id);
  }

  @Get('posts/:postId')
  @ApiOperation({ summary: 'Retrieve a post by its ID with full details' })
  @ApiResponse({ status: 200, description: 'Post retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  async getPostById(@Param('postId', ParseIntPipe) postId: number) {
    return this.adminService.getPostById(postId);
  }

  @Post('create-partnership')
  @ApiOperation({ summary: 'Create a new partnership' })
  @ApiResponse({
    status: 201,
    description: 'Partnership created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request.' })
  async createPartnership(@Body() dto: CreatePartnershipDto) {
    return this.adminService.createPartnership(dto);
  }

  @Get('partnerships')
  @ApiOperation({ summary: 'Get all partnerships with activity stats' })
  @ApiResponse({ status: 200, description: 'List of partnerships returned' })
  async getAllPartnerships() {
    return this.adminService.getAllPartnershipsWithStats();
  }

  @Get('referral-status')
  @ApiOperation({
    summary: 'Check referral user flag status',
    description:
      'Checks whether a user (by partnerUserId) linked via referralToken has a specific activity flag.\n' +
      'Flags: posted_to_twitter (tweet successfully published), first_purchase, completed_profile.'
  })
  @ApiQuery({ name: 'ref', required: true, description: 'Referral token from partnership' })
  @ApiQuery({ name: 'puid', required: true, description: 'Partner user id provided by external partner' })
  @ApiQuery({ name: 'flag', required: true, description: 'Activity flag to check, e.g., posted_to_twitter' })
  @ApiResponse({ status: 200, description: 'Flag status returned' })
  async checkReferralStatus(
    @Query('ref') ref: string,
    @Query('puid') puid: string,
    @Query('flag') flag: string,
  ) {
    return this.adminService.checkReferralFlag({
      referralToken: ref,
      partnerUserId: puid,
      flag,
    });
  }

  @Post('referral-flag')
  @ApiOperation({
    summary: 'Set referral user flag (idempotent)',
    description:
      'Marks a referral activity flag for a linked user.\n' +
      'Flags: posted_to_twitter, first_purchase, completed_profile.'
  })
  @ApiResponse({ status: 200, description: 'Flag set or already set' })
  async setReferralFlag(
    @Body('ref') ref: string,
    @Body('puid') puid: string,
    @Body('flag') flag: string,
  ) {
    return this.adminService.setReferralFlag({
      referralToken: ref,
      partnerUserId: puid,
      flag,
    });
  }

  @Post('force-start-contest')
  @ApiOperation({ summary: 'Force start a specific contest immediately' })
  @ApiResponse({ 
    status: 200, 
    description: 'Contest force started successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        contestId: { type: 'number' },
        contestName: { type: 'string' },
        startTime: { type: 'string' },
        timestamp: { type: 'string' },
        error: { type: 'string' }
      },
      required: ['success', 'message', 'timestamp']
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - contest not found or already active' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async forceStartContest(@Body() dto: ForceStartContestDto) {
    return this.adminService.forceStartContest(dto.contestId);
  }
}
