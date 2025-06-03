import { Controller, Post, Body } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { SendNotificationDto } from './dto/send.notification.dto';
import { ApiBody, ApiResponse } from '@nestjs/swagger';

@Controller('firebase')
export class FirebaseController {
  constructor(private readonly firebaseService: FirebaseService) {}

  @Post('send-notification')
  @ApiBody({ type: SendNotificationDto })
  @ApiResponse({ status: 201, description: 'Notification sent successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async sendNotification(@Body() sendNotificationDto: SendNotificationDto) {
    const { token, title, body } = sendNotificationDto;
    return this.firebaseService.sendNotification(token, title, body);
  }
}
