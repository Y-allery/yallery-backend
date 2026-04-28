import { Injectable } from '@nestjs/common';
import { BlockPostDto } from '../../dto/block.post.dto';
import { BlockUserDto } from '../../dto/block.user.dto';
import { GetAllReportsDto } from '../../dto/get.report.post.dto';
import { PostService } from 'src/post/post.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly userService: UserService,
    private readonly postService: PostService,
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
    await this.postService.unblockPost(post_id);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async blockPost({ post_id }: BlockPostDto) {
    return this.postService.blockPost(post_id);
  }

  async getReportPosts(data: GetAllReportsDto) {
    return this.postService.getReportPosts(data);
  }

  async getPostById(postId: number): Promise<any> {
    return this.postService.getPostById(postId);
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postService.deleteReport(reportId);
  }

  async rejectComplaint(
    complaintId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postService.deleteReport(complaintId);
  }
}
