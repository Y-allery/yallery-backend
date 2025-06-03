import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SetNotificationPreferenceDto } from './dto/change.notification.settings.dto';

@Controller('notification')
@UseGuards(JwtAuthGuard)
@ApiTags('Notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('set')
  @ApiOperation({ summary: 'Set notification preference' })
  @ApiBody({ type: SetNotificationPreferenceDto })
  async setPreference(
    @Req() req: any,
    @Body() body: SetNotificationPreferenceDto,
  ) {
    const userId = req.user.id;
    const { activityType, enabled } = body;
    await this.notificationService.setPreference(userId, activityType, enabled);
    return { message: 'Preference updated successfully' };
  }
}
