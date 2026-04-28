import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { RoleEnum } from 'src/user/types/role.enum';
import { AdminService } from '../admin.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminMetricsController {
  constructor(private readonly adminService: AdminService) {}

  @Post('metrics/recalculate')
  @ApiOperation({
    summary: 'Force recalculate 7-day admin metrics snapshot',
    description:
      'Triggers the same logic as the hourly cron job to immediately recalculate and store a fresh 7-day metrics snapshot.',
  })
  @ApiResponse({
    status: 200,
    description: 'Metrics snapshot recalculated successfully.',
  })
  async recalculateAdminMetrics() {
    await this.adminService.collectAdminMetricsSnapshot();
    return { success: true };
  }

  @Get('metrics/overview')
  @ApiOperation({
    summary: 'Get aggregated admin metrics',
    description:
      'Returns high-level aggregated metrics (users, posts, likes) for a fixed rolling 7-day period. ' +
      'Data is pre-aggregated hourly by a background cron job; the endpoint always returns the latest weekly snapshot.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated 7-day metrics overview returned successfully.',
  })
  async getAdminMetricsOverview() {
    return this.adminService.getAdminMetricsOverview();
  }
}
