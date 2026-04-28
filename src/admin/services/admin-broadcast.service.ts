import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BroadcastNotificationDto,
  NotificationType,
} from '../dto/broadcast-notification.dto';
import { FirebaseService } from 'src/firebase/firebase.service';
import { MailService } from 'src/mail/mail.service';
import { DeviceTokenEntity } from 'src/user/entities/device-token.entity';
import { UserEntity } from 'src/user/entities/user.entity';

@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenRepository: Repository<DeviceTokenEntity>,
    private readonly firebaseService: FirebaseService,
    private readonly mailService: MailService,
  ) {}

  async broadcastNotification(dto: BroadcastNotificationDto) {
    const { type, title, body, emailSubject } = dto;
    const USER_BATCH_SIZE = 100;
    const NOTIFICATION_BATCH_SIZE = 10;
    let offset = 0;
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    this.logger.log(`Starting ${type} notification broadcast: "${title}"`);

    while (true) {
      const users = await this.userRepository.find({
        where: { isDeleted: false, emailVerified: true },
        relations: { deviceTokens: true },
        take: USER_BATCH_SIZE,
        skip: offset,
      });

      if (users.length === 0) {
        break;
      }

      for (let i = 0; i < users.length; i += NOTIFICATION_BATCH_SIZE) {
        const batch = users.slice(i, i + NOTIFICATION_BATCH_SIZE);

        const batchPromises = batch.map(async (user) => {
          try {
            if (type === NotificationType.PUSH) {
              if (user.deviceTokens && user.deviceTokens.length > 0) {
                const deviceTokenPromises = user.deviceTokens.map(
                  async (deviceToken) => {
                    try {
                      const result =
                        await this.firebaseService.sendNotification(
                          deviceToken.token,
                          title,
                          body,
                        );

                      if (!result.success && result.isInvalidToken) {
                        this.logger.log(
                          `Removing invalid token for user ${user.id}`,
                        );
                        try {
                          await this.deviceTokenRepository.remove(deviceToken);
                        } catch (removeError) {
                          this.logger.error(
                            `Failed to remove invalid token:`,
                            removeError.message,
                          );
                        }
                        return { success: false, removed: true };
                      }

                      return { success: result.success };
                    } catch (deviceError) {
                      this.logger.error(
                        `Push notification failed for user ${user.id}:`,
                        deviceError.message,
                      );
                      return { success: false };
                    }
                  },
                );

                await Promise.all(deviceTokenPromises);
              }
            } else if (type === NotificationType.EMAIL) {
              if (user.email) {
                try {
                  const subject = emailSubject || title;
                  await this.mailService.sendBroadcastEmail(
                    user.email,
                    subject,
                    body,
                  );
                } catch (emailError) {
                  this.logger.error(
                    `Email notification failed for user ${user.id}:`,
                    emailError.message,
                  );
                  throw emailError;
                }
              }
            }

            totalSuccess++;
            return { success: true, userId: user.id };
          } catch (userError) {
            this.logger.error(
              `Error processing user ${user.id}:`,
              userError.message,
            );
            totalErrors++;
            return {
              success: false,
              userId: user.id,
              error: userError.message,
            };
          }
        });

        await Promise.all(batchPromises);
        totalProcessed += batch.length;

        if (i + NOTIFICATION_BATCH_SIZE < users.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      offset += USER_BATCH_SIZE;

      if (users.length >= USER_BATCH_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const result = {
      success: true,
      type,
      totalProcessed,
      totalSuccess,
      totalErrors,
      message: `${type} notification broadcast completed: ${totalSuccess} sent, ${totalErrors} errors`,
    };

    this.logger.log(`Broadcast completed: ${result.message}`);
    return result;
  }
}
