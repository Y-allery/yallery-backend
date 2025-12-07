import { Controller, Post, Body } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { SendNotificationDto } from './dto/send.notification.dto';
import { ApiBody, ApiResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { FIREBASE_SWAGGER } from 'src/common/swagger';

@ApiTags('Firebase')
@Controller('firebase')
export class FirebaseController {
  constructor(private readonly firebaseService: FirebaseService) {}

  @Post('send-notification')
  @ApiOperation(FIREBASE_SWAGGER.sendNotification)
  @ApiBody({ type: SendNotificationDto })
  @ApiResponse(FIREBASE_SWAGGER.sendNotification.responses.success)
  @ApiResponse(FIREBASE_SWAGGER.sendNotification.responses.badRequest)
  @ApiResponse(FIREBASE_SWAGGER.sendNotification.responses.internalError)
  async sendNotification(@Body() sendNotificationDto: SendNotificationDto) {
    const { token, title, body } = sendNotificationDto;
    return this.firebaseService.sendNotification(token, title, body);
  }
}
