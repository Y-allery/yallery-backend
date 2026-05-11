import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { BroadcastNotificationDto } from 'src/modules/admin/dto/broadcast-notification.dto';
import { AdminBroadcastService } from './admin-broadcast.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminBroadcastController {
  constructor(private readonly adminBroadcastService: AdminBroadcastService) {}

  @Post('broadcast-notification')
  @ApiOperation({
    summary: 'Broadcast notification to all users',
    description:
      'Sends push notifications or email notifications to all verified users. ' +
      'Notifications are sent in batches to prevent system overload. ' +
      'Event loop is preserved with delays between batches.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification broadcast started successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        type: { type: 'string', enum: ['push', 'email'] },
        totalProcessed: { type: 'number' },
        totalSuccess: { type: 'number' },
        totalErrors: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid input' })
  async broadcastNotification(@Body() dto: BroadcastNotificationDto) {
    return this.adminBroadcastService.broadcastNotification(dto);
  }
}
