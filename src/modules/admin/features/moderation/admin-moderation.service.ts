import { Injectable } from '@nestjs/common';
import { BlockPostDto } from 'src/modules/admin/dto/block.post.dto';
import { BlockUserDto } from 'src/modules/admin/dto/block.user.dto';
import { GetAllReportsDto } from 'src/modules/admin/dto/get.report.post.dto';
import { PostModerationService } from 'src/modules/posts/services/post-moderation.service';
import { UserService } from 'src/modules/users/user.service';

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly userService: UserService,
    private readonly postModerationService: PostModerationService,
  ) {}

  async blockUser({ user_id }: BlockUserDto) {
    await this.userService.deleteUserAccount(user_id);
    return {
      success: true,
      message: 'User blocked succesfully',
    };
  }

  async unblockUser({ user_id }: BlockUserDto) {
    await this.userService.unblockUserAccount(user_id);
    return {
      success: true,
      message: 'User unblocked successfully',
    };
  }

  async unblockPost({ post_id }: BlockPostDto) {
    await this.postModerationService.unblockPost(post_id);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async blockPost({ post_id }: BlockPostDto) {
    return this.postModerationService.blockPost(post_id);
  }

  async getReportPosts(data: GetAllReportsDto) {
    return this.postModerationService.getReportPosts(data);
  }

  async getPostById(postId: number): Promise<any> {
    return this.postModerationService.getPostById(postId);
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postModerationService.deleteReport(reportId);
  }

  async rejectComplaint(
    complaintId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postModerationService.deleteReport(complaintId);
  }
}
