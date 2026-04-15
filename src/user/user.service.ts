import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { DeviceType } from './types/device.interface';
import { FirebaseService } from 'src/firebase/firebase.service';
import { getNotificationMessage } from 'src/common/helpers/notification.helper';
import { UploadService } from 'src/upload/upload.service';
import { ReferralEntity } from './entities/user-refferals.entity';
import { v4 as uuidv4 } from 'uuid';
import { UpdateUserDto } from './dto/update.user.details.dto';
import { PostEntity } from 'src/post/entities/post.entity';
import { LikeEntity } from 'src/like/entities/like.entity';
import { LogReferralActivityDto } from './dto/log-referral-activity.dto';
import { PartnershipEntity } from 'src/admin/entities/partner.entity';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { ReportPostEntity } from 'src/post/entities/report.post.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';
import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { UserActivityQueryService } from 'src/user-activity/services/user-activity-query.service';
import { UserNotificationTypeEnum } from 'src/notification/types/user-notification-type.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userModel: Repository<UserEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeModel: Repository<LikeEntity>,
    @InjectRepository(TagEntity)
    private readonly tagModel: Repository<TagEntity>,
    @InjectRepository(PostEntity)
    private readonly postModel: Repository<PostEntity>,
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenModel: Repository<DeviceTokenEntity>,
    private readonly userActivityQueryService: UserActivityQueryService,
    private readonly rewardService: RewardService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,

    private readonly firebaseService: FirebaseService,
    private readonly uploadService: UploadService,
    @InjectRepository(ReferralEntity)
    private readonly referralRepository: Repository<ReferralEntity>,
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepository: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    @InjectRepository(ReportPostEntity)
    private readonly reportPostRepository: Repository<ReportPostEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,

    private readonly dataSource: DataSource,
  ) {}

  async generateReferralCode(userId: number): Promise<string> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let code: string;
    let isUnique = false;

    while (!isUnique) {
      code = uuidv4().split('-')[0];
      const existingCode = await this.referralRepository.findOne({
        where: { code },
      });
      if (!existingCode) {
        isUnique = true;
      }
    }

    const referral = this.referralRepository.create({
      code,
      user,
    });

    await this.referralRepository.save(referral);

    return code;
  }

  async findByEmail(email: string): Promise<UserEntity | undefined> {
    return this.userModel.findOne({ where: { email } });
  }

  async findById(id: number): Promise<UserEntity | undefined> {
    return this.userModel.findOne({ where: { id }, relations: ['tags'] });
  }

  async updateUser(user: UserEntity): Promise<UserEntity> {
    return this.userModel.save(user);
  }

  async updateTwitterUsername(
    userId: number,
    twitterUsername: string,
  ): Promise<{ message: string }> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const rewardPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.REGISTRATION_BONUS,
      3000,
    );
    user.points = (user.points || 0) + rewardPoints;
    user.twitterUsername = twitterUsername;
    await this.userModel.save(user);
    await this.notificationGateway.emitProfileUpdate(userId.toString());
    return { message: 'Twitter username updated successfully' };
  }

  async updateUserDetails(
    userId: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserEntity> {
    const { password, nickname, name, email } = updateUserDto;
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (password) {
      user.password = await this.hashPassword(password);
    }

    if (nickname) {
      if (!(await this.isNicknameUnique(nickname))) {
        throw new BadRequestException('Nickname already in use');
      }
      user.nickname = nickname;
    }

    if (email) {
      if (!(await this.isEmailUnique(email))) {
        throw new BadRequestException('Email already in use');
      }
      user.email = email;
    }

    if (name) {
      user.name = name;
    }

    return await this.userModel.save(user);
  }

  async saveUser(user: UserEntity): Promise<void> {
    await this.userModel.save(user);
  }
  private async isNicknameUnique(nickname: string): Promise<boolean> {
    const existingUser = await this.userModel.findOne({ where: { nickname } });
    return !existingUser;
  }

  private async isEmailUnique(email: string): Promise<boolean> {
    const existingUser = await this.userModel.findOne({ where: { email } });
    return !existingUser;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async addTagsToUser(
    userId: number,
    tagIds: number[],
  ): Promise<{ message: string }> {
    const user = await this.userModel.findOne({
      where: { id: userId },
      relations: ['tags'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingTags = await this.tagModel.findBy({ id: In(tagIds) });
    const existingTagIds = existingTags.map((tag) => tag.id);

    const newTags = existingTags.filter(
      (tag) => !user.tags.some((t) => t.id === tag.id),
    );

    if (newTags.length > 0) {
      user.tags.push(...newTags);
      await this.userModel.save(user);
    }

    const notFoundTagIds = tagIds.filter(
      (tagId) => !existingTagIds.includes(tagId),
    );

    if (notFoundTagIds.length > 0) {
      throw new BadRequestException(
        `Tags not found: ${notFoundTagIds.join(', ')}`,
      );
    }

    return {
      message: 'Tags added succesfully',
    };
  }

  async removeTagFromUser(
    userId: number,
    tagId: number,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findOne({
      where: { id: userId },
      relations: ['tags'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tagToRemove = user.tags.find((tag) => tag.id === tagId);
    if (!tagToRemove) {
      throw new NotFoundException(
        `Tag with id ${tagId} not associated with this user`,
      );
    }

    user.tags = user.tags.filter((tag) => tag.id !== tagId);
    await this.userModel.save(user);

    return {
      message: 'Tag removed successfully',
    };
  }

  async deleteUserAccount(user_id: number) {
    const user = await this.userModel.findOne({
      where: { id: user_id },
    });
    if (!user) throw new NotFoundException('User not found');

    // Використовуємо транзакцію для повного видалення
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Видаляємо всі зв'язки, які не мають CASCADE DELETE через SQL запити

      // 1. Оновлюємо contests, де user є winner (встановлюємо NULL) - робимо ПЕРЕД видаленням
      await queryRunner.query(
        'UPDATE contests SET winnerId = NULL WHERE winnerId = ?',
        [user_id],
      );

      // 2. Видаляємо referrals (де user є власником або використовувачем)
      await queryRunner.query(
        'DELETE FROM referrals WHERE userId = ? OR usedById = ?',
        [user_id, user_id],
      );

      // 3. Видаляємо partner_user_links
      await queryRunner.query(
        'DELETE FROM partner_user_links WHERE userId = ?',
        [user_id],
      );

      // 4. Видаляємо partnership_activities
      await queryRunner.query(
        'DELETE FROM partnership_activities WHERE userId = ?',
        [user_id],
      );

      // 5. Видаляємо reports (де user є reporting або reported)
      await queryRunner.query(
        'DELETE FROM reports WHERE reportingUserId = ? OR reportedUserId = ?',
        [user_id, user_id],
      );

      // 6. Видаляємо payments
      await queryRunner.query(
        'DELETE FROM payments WHERE userId = ?',
        [user_id],
      );

      // 7. Видаляємо самого користувача
      // CASCADE DELETE автоматично видалить:
      // - posts, likes, viewed_posts, activities, device_tokens, notification_preferences
      // - зв'язки з tags через users_tags_tags
      await queryRunner.query(
        'DELETE FROM users WHERE id = ?',
        [user_id],
      );

      await queryRunner.commitTransaction();
      return { status: 'Success', message: 'User deleted successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error deleting user account:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleDailyReward() {
    const dailyReward = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.DAILY_LOGIN,
      10,
    );

    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const usersToUpdate = await this.userModel
      .createQueryBuilder('user')
      .select(['user.id', 'user.points'])
      .where('user.updatedAt >= :todayStart', { todayStart })
      .getMany();

    await Promise.all(
      usersToUpdate.map(async (user) => {
        await this.userModel
          .createQueryBuilder()
          .update(UserEntity)
          .set({ points: user.points + dailyReward })
          .where('id = :id', { id: user.id })
          .execute();

        await this.sendPushNotificationIfEnabled(
          user.id,
          UserNotificationTypeEnum.DAILY_REWARD,
        );
      }),
    );
  }

  async unblockUserAccount(user_id: number) {
    const user = await this.userModel.findOne({
      where: { id: user_id },
    });
    if (!user) throw new NotFoundException('User not found');

    user.isDeleted = false;
    await this.userModel.save(user);
    return { status: 'Success', message: 'User unblocked successfully' };
  }

  async addDeviceToken(
    userId: number,
    token: string,
    deviceType: DeviceType,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingToken = await this.deviceTokenModel.findOne({
      where: { user: { id: user.id }, deviceType: deviceType },
    });

    if (existingToken) {
      existingToken.token = token;
      await this.deviceTokenModel.save(existingToken);
    } else {
      const newToken = this.deviceTokenModel.create({
        token,
        deviceType,
        user,
      });
      await this.deviceTokenModel.save(newToken);
    }

    return { message: 'Device token registered successfully' };
  }

  async removeDeviceTokensByType(
    userId: number,
    deviceType: string,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findOne({
      where: { id: userId },
      relations: ['deviceTokens'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tokensToRemove = user.deviceTokens.filter(
      (token) => token.deviceType === deviceType,
    );
    if (tokensToRemove.length === 0) {
      throw new NotFoundException('No tokens found for this device type');
    }

    for (const token of tokensToRemove) {
      await this.deviceTokenModel.remove(token);
    }

    return {
      message:
        'All device tokens for the specified type were unregistered successfully',
    };
  }

  async sendPushNotificationIfEnabled(
    userId: number,
    activityType: UserNotificationTypeEnum,
  ) {
    const user = await this.userModel.findOne({
      where: { id: userId },
      relations: ['notificationPreferences'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const preference = user.notificationPreferences.find(
      (pref) => pref.activityType === activityType,
    );

    const isLikeNotification =
      activityType === UserNotificationTypeEnum.LIKE_EARN ||
      activityType === UserNotificationTypeEnum.LIKE_SPEND;

    const { title, body } = getNotificationMessage(activityType);

    if (
      user.notificationsEnabled &&
      (!isLikeNotification || (preference && preference.enabled))
    ) {
      const deviceTokens = await this.deviceTokenModel.find({
        where: { user: { id: userId } },
      });

      for (const deviceToken of deviceTokens) {
        try {
          const result = await this.firebaseService.sendNotification(
            deviceToken.token,
            title,
            body,
          );
          
          // Якщо токен невалідний - видаляємо його з бази
          if (!result.success && result.isInvalidToken) {
            console.log(`🗑️ Removing invalid token for user ${userId} (token: ${deviceToken.token.substring(0, 10)}...)`);
            try {
              await this.deviceTokenModel.remove(deviceToken);
            } catch (removeError) {
              console.error(`❌ Failed to remove invalid token:`, removeError.message);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to send notification to token:`, error.message);
        }
      }
    }
  }

  async updateAvatar(
    userId: number,
    imageData: Buffer,
  ): Promise<{ success: boolean; url: string }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const avatarUrl = await this.uploadService.uploadByBuffer(imageData);
    user.avatar = avatarUrl;
    await this.updateUser(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return { success: true, url: avatarUrl };
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Old password is incorrect');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await this.updateUser(user);
    return {
      success: true,
    };
  }

  async updateName(userId: number, name: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.name = name;
    await this.updateUser(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return {
      success: true,
    };
  }

  async updateNickname(userId: number, nickname: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingUser = await this.userModel.findOne({
      where: { nickname },
    });
    if (existingUser) {
      throw new BadRequestException('Nickname already in use');
    }

    user.nickname = nickname;
    await this.updateUser(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return {
      success: true,
    };
  }

  async getUserProfile(userId: number) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const unreadCount =
      await this.userActivityQueryService.countUnreadFeed(userId);

    const unreadContestActivity =
      await this.userActivityQueryService.countUnreadContestActivitiesByType(
        userId,
        ContestTypeEnum.DEFAULT,
      );
    const unreadCollabsActivity =
      await this.userActivityQueryService.countUnreadContestActivitiesByType(
        userId,
        ContestTypeEnum.FINE_TUNE,
      );
    
    // Get puid (partnerUserId) from partner_user_links
    const partnerUserLink = await this.partnerUserLinkRepository.findOne({
      where: { userId },
    });
    const puid = partnerUserLink?.partnerUserId ?? null;
    
    // Get total likes count - count all likes on user's posts
    const totalLikesCount = await this.likeModel
      .createQueryBuilder('like')
      .innerJoin('like.post', 'post')
      .where('post.userId = :userId', { userId })
      .getCount();
    
    // Return only specified fields
    return {
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      notificationsEnabled: user.notificationsEnabled,
      points: user.points,
      tags: user.tags || [],
      is_auth_finished: !!(
        user.nickname &&
        user.password &&
        user.email &&
        !user.email.includes('@telegram.local')
      ),
      avatar: user.avatar ?? null,
      unreadCount,
      unreadContestActivity,
      unreadCollabsActivity,
      emailVerified: user.emailVerified,
      twitterUsername: user.twitterUsername,
      totalLikesCount,
    };
  }

  async useReferralCode(userId: number, code: string): Promise<void> {
    const referral = await this.referralRepository.findOne({
      where: { code },
      relations: ['user', 'usedBy'],
    });

    if (!referral) {
      throw new NotFoundException('Referral code not found');
    }

    if (referral.usedBy) {
      throw new BadRequestException('Referral code is already used');
    }

    if (referral.user.id === userId) {
      throw new BadRequestException('You can’t use your own referral code');
    }

    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.bonusEligible) {
      throw new BadRequestException(
        'You can only receive the referral bonus once',
      );
    }

    referral.usedBy = user;
    await this.referralRepository.save(referral);

    const rewardPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.REFERRAL_REWARD,
      500,
    );

    user.points += rewardPoints;
    referral.user.points += rewardPoints;

    user.bonusEligible = false;

    await this.updateUser(user);
    await this.updateUser(referral.user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    await this.notificationGateway.emitProfileUpdate(referral.user.id.toString());
  }
  async logReferralActivity(dto: LogReferralActivityDto, userId: number) {
    const partnership = await this.partnerShipRepository.findOne({
      where: { referralToken: dto.referralToken },
    });

    if (!partnership) {
      throw new NotFoundException('Referral not found');
    }

    const user = await this.userModel.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const existing = await this.partnerShipActivityRepository.findOne({
      where: {
        userId: user.id,
        partnershipId: partnership.id,
        activity: dto.activity,
      },
    });

    if (existing) {
      return { message: 'Activity already logged', activity: existing };
    }

    const activity = this.partnerShipActivityRepository.create({
      userId: user.id,
      activity: dto.activity,
      partnershipId: partnership.id,
    });

    return await this.partnerShipActivityRepository.save(activity);
  }

  async updateUserLastUpdated(user_id: string) {
    await this.userModel.update(user_id, { updatedAt: new Date() });
  }

  async incrementUserPoints(userId: number, points: number): Promise<void> {
    await this.userModel.increment({ id: userId }, 'points', points);
  }
}
