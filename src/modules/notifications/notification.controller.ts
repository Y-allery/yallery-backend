import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { ApiBody, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { NOTIFICATION_SWAGGER } from 'src/shared/swagger';
import { SetNotificationPreferenceDto } from './dto/change.notification.settings.dto';
import { USER_NOTIFICATION_PREFERENCE_TYPES } from './types/user-notification-type.enum';
import { RequestLocale } from 'src/modules/translations/request-locale.decorator';
import { SupportedLocale } from 'src/modules/translations/translation.catalog';

@Controller('notification')
@UseGuards(JwtAuthGuard)
@ApiTags('Notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('types')
  @ApiOperation(NOTIFICATION_SWAGGER.getNotificationTypes)
  @ApiResponse(NOTIFICATION_SWAGGER.getNotificationTypes.responses.success)
  async getNotificationTypes(
    @Req() req: any,
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const userId = req.user.id;
    return await this.notificationService.getNotificationPreferences(
      userId,
      [...USER_NOTIFICATION_PREFERENCE_TYPES],
      locale,
    );
  }

  @Post('set')
  @ApiOperation(NOTIFICATION_SWAGGER.setPreference)
  @ApiBody({ type: SetNotificationPreferenceDto })
  @ApiResponse(NOTIFICATION_SWAGGER.setPreference.responses.success)
  @ApiResponse(NOTIFICATION_SWAGGER.setPreference.responses.badRequest)
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
