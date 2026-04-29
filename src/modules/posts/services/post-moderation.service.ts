import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportPostDto } from '../dto/report.post.dto';
import { PostEntity } from '../entities/post.entity';
import { ReportPostEntity } from '../entities/report.post.entity';

@Injectable()
export class PostModerationService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(ReportPostEntity)
    private readonly reportPostRepository: Repository<ReportPostEntity>,
  ) {}

  async blockPost(postId: number) {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    post.isBlocked = true;
    await this.postRepository.save(post);
    return {
      success: true,
      message: 'Post blocked succesfully',
    };
  }

  async unblockPost(postId: number) {
    const post = await this.postRepository.findOne({
      where: { id: postId, isBlocked: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    post.isBlocked = false;
    await this.postRepository.save(post);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async reportPost(dto: ReportPostDto, userId: number) {
    const { postId, description } = dto;

    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingReport = await this.reportPostRepository.findOne({
      where: {
        post: { id: postId },
        reportingUser: { id: userId },
      },
    });

    if (existingReport) {
      return { message: 'You have already reported this post' };
    }

    const newReport = this.reportPostRepository.create({
      reportingUser: { id: userId },
      reportedUser: { id: post.user.id },
      post,
      description,
    });

    await this.reportPostRepository.save(newReport);
    return { message: 'Report has been submitted successfully' };
  }

  async getReportPosts({ page, limit }: { page: number; limit: number }) {
    const offset = (page - 1) * limit;

    const queryBuilder = this.reportPostRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.post', 'post')
      .leftJoinAndSelect('post.tag', 'tag')
      .leftJoinAndSelect('report.reportingUser', 'reportingUser')
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .orderBy('reportedUser.isDeleted', 'ASC')
      .addOrderBy('post.isBlocked', 'ASC')
      .addOrderBy('report.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [results, total] = await queryBuilder.getManyAndCount();

    return {
      data: results.map((report) => ({
        reportId: report.id,
        postId: report.post.id,
        postImageUrl: report.post.imageUrl,
        tagName: report.post.tag ? report.post.tag.name : null,
        reportingUserId: report.reportingUser.id,
        reportingUserName: report.reportingUser.name,
        reportedUserId: report.reportedUser.id,
        reportedUserName: report.reportedUser.name,
        description: report.description,
        reportDate: report.createdAt,
        is_user_blocked: report.reportedUser.isDeleted,
        is_post_blocked: report.post.isBlocked,
      })),
      total,
      page,
      limit,
    };
  }

  async rejectComplaint(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.reportPostRepository.remove(report);

    return {
      success: true,
      message: 'Complaint rejected and report deleted successfully.',
    };
  }

  async getPostById(postId: number): Promise<any> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['user', 'tag', 'contest', 'likes'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return {
      id: post.id,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt,
      user: {
        id: post.user.id,
        name: post.user.name,
        email: post.user.email,
        avatarUrl: post.user.avatar,
      },
      tag: {
        id: post.tag.id,
        name: post.tag.name,
      },
      contest: post.contest
        ? {
            id: post.contest.id,
            name: post.contest.name,
            status: post.contest.status,
            description: post.contest.description,
          }
        : null,
      likeCount: post.likes.length,
      isPublished: post.isPublished,
      isBlocked: post.isBlocked,
      isRejected: post.isRejected,
    };
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostRepository.findOne({
      where: { id: reportId },
      relations: { reportedUser: true, reportingUser: true, post: true },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.reportPostRepository.delete(reportId);
    return {
      success: true,
      message: 'Report deleted successfully',
    };
  }
}
