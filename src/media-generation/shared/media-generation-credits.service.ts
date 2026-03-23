import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { UserEntity } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';

@Injectable()
export class MediaGenerationCreditsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly activityService: ActivityService,
    private readonly notificationGateway: NotificationGateway,
    private readonly userService: UserService,
  ) {}

  async verifyUserHasEnoughCredits(
    userId: number,
    amount: number,
    errorMessage = 'Not enough credits to generate images',
  ): Promise<void> {
    if (amount <= 0) {
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'points'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if ((user.points || 0) < amount) {
      throw new BadRequestException(errorMessage);
    }
  }

  async consumeGenerationCredits(params: {
    userId: number;
    amount: number;
    activityType: ActivityEnum;
  }): Promise<void> {
    if (params.amount <= 0) {
      return;
    }

    const result = await this.userRepository.decrement(
      { id: params.userId },
      'points',
      params.amount,
    );

    if (!result.affected) {
      throw new NotFoundException('User not found');
    }

    await this.notificationGateway.emitProfileUpdate(params.userId.toString());

    const description = await this.activityService.createActivitiesV2({
      fromUserId: null,
      toUserIds: [params.userId],
      type: params.activityType,
      isAdmin: false,
      generationCost: params.amount,
    });

    await this.notificationGateway.sendNotification(
      params.userId.toString(),
      description,
      params.activityType,
    );

    await this.userService.sendPushNotificationIfEnabled(
      params.userId,
      params.activityType,
    );
  }
}
