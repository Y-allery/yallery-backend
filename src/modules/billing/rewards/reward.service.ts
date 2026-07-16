import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { RewardEntity } from './entities/reward.entity';
import { UserRewardEntity } from './entities/user-reward.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { UserService } from 'src/modules/users/user.service';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';

@Injectable()
export class RewardService {
  private readonly excludedRewardTypes = [
    RewardTypeEnum.PAYMENT_5000,
    RewardTypeEnum.PAYMENT_15000,
    RewardTypeEnum.PAYMENT_30000,
  ];

  private readonly claimableRewardTypes = [
    RewardTypeEnum.DAILY_LOGIN,
    RewardTypeEnum.POST_VIDEO_REWARD,
    RewardTypeEnum.POST_PHOTO_REWARD,
    RewardTypeEnum.CONTEST_PARTICIPATION,
    RewardTypeEnum.REGISTRATION_REWARD,
    RewardTypeEnum.RATE_APP,
  ];

  private readonly oneTimeRewardTypes = [
    RewardTypeEnum.CONTEST_PARTICIPATION,
    RewardTypeEnum.REGISTRATION_REWARD,
    RewardTypeEnum.RATE_APP,
  ];

  constructor(
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
    @InjectRepository(UserRewardEntity)
    private readonly userRewardRepository: Repository<UserRewardEntity>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async getAllRewards(): Promise<{
    daily: RewardEntity[];
    oneTime: RewardEntity[];
    other: RewardEntity[];
  }> {
    const allRewards = await this.rewardRepository
      .createQueryBuilder('reward')
      .select([
        'reward.id',
        'reward.rewardType',
        'reward.points',
        'reward.description',
        'reward.isActive',
        'reward.isDaily',
        'reward.createdAt',
        'reward.updatedAt',
      ])
      .where('reward.rewardType NOT IN (:...excluded)', { excluded: this.excludedRewardTypes })
      .orderBy('reward.rewardType', 'ASC')
      .getMany();

    const daily: RewardEntity[] = [];
    const oneTime: RewardEntity[] = [];
    const other: RewardEntity[] = [];

    for (const reward of allRewards) {
      if (reward.isDaily) {
        daily.push(reward);
      } else if (this.oneTimeRewardTypes.includes(reward.rewardType as RewardTypeEnum)) {
        oneTime.push(reward);
      } else {
        other.push(reward);
      }
    }

    return { daily, oneTime, other };
  }

  async getRewardByType(rewardType: RewardTypeEnum): Promise<RewardEntity | null> {
    // Не повертаємо Payment нагороди через GET
    if (this.excludedRewardTypes.includes(rewardType)) {
      return null;
    }
    return this.rewardRepository
      .createQueryBuilder('reward')
      .select([
        'reward.id',
        'reward.rewardType',
        'reward.points',
        'reward.description',
        'reward.isActive',
        'reward.isDaily',
        'reward.createdAt',
        'reward.updatedAt',
      ])
      .where('reward.rewardType = :rewardType', { rewardType })
      .andWhere('reward.isActive = :isActive', { isActive: true })
      .getOne();
  }

  async getRewardPoints(rewardType: RewardTypeEnum): Promise<number> {
    // Використовуємо внутрішній метод, який не фільтрує Payment нагороди
    const reward = await this.getRewardByTypeInternal(rewardType);
    if (!reward) {
      throw new NotFoundException(`Reward type ${rewardType} not found or inactive`);
    }
    return reward.points;
  }

  // Внутрішній метод для отримання нагороди без фільтрації Payment
  private async getRewardByTypeInternal(rewardType: RewardTypeEnum): Promise<RewardEntity | null> {
    return this.rewardRepository
      .createQueryBuilder('reward')
      .select([
        'reward.id',
        'reward.rewardType',
        'reward.points',
        'reward.description',
        'reward.isActive',
        'reward.isDaily',
        'reward.createdAt',
        'reward.updatedAt',
      ])
      .where('reward.rewardType = :rewardType', { rewardType })
      .andWhere('reward.isActive = :isActive', { isActive: true })
      .getOne();
  }

  async updateReward(
    rewardType: RewardTypeEnum,
    updateDto: UpdateRewardDto,
  ): Promise<RewardEntity> {
    const reward = await this.rewardRepository
      .createQueryBuilder('reward')
      .select([
        'reward.id',
        'reward.rewardType',
        'reward.points',
        'reward.description',
        'reward.isActive',
        'reward.isDaily',
        'reward.createdAt',
        'reward.updatedAt',
      ])
      .where('reward.rewardType = :rewardType', { rewardType })
      .getOne();

    if (!reward) {
      throw new NotFoundException(`Reward type ${rewardType} not found`);
    }

    if (updateDto.points !== undefined) {
      reward.points = updateDto.points;
    }
    if (updateDto.description !== undefined) {
      reward.description = updateDto.description;
    }
    if (updateDto.is_active !== undefined) {
      reward.isActive = updateDto.is_active;
    }

    return this.rewardRepository.save(reward);
  }

  async getRewardPointsOrDefault(
    rewardType: RewardTypeEnum,
    defaultValue: number,
  ): Promise<number> {
    try {
      return await this.getRewardPoints(rewardType);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Mark reward as eligible for a user.
   */
  async markRewardEligible(
    userId: number,
    rewardType: RewardTypeEnum,
  ): Promise<UserRewardEntity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // One-time rewards: block re-eligibility if any record exists
    if (this.oneTimeRewardTypes.includes(rewardType)) {
      const existingAnyDate = await this.userRewardRepository.findOne({
        where: { userId, rewardType },
      });
      if (existingAnyDate) {
        return existingAnyDate;
      }
    }

    // Daily/recurring: check for existing record today
    const existing = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType,
        eligibleDate: today,
      },
    });

    if (existing) {
      return existing;
    }

    const userReward = this.userRewardRepository.create({
      userId,
      rewardType,
      eligibleDate: today,
      claimedDate: null,
      pointsAwarded: null,
    });

    return await this.userRewardRepository.save(userReward);
  }

  /**
   * Get available rewards grouped by daily/one-time.
   */
  async getAvailableRewards(userId: number): Promise<{
    daily: {
      rewardType: RewardTypeEnum;
      reward: RewardEntity;
      isEligible: boolean;
      isClaimed: boolean;
      eligibleDate: Date | null;
      claimedDate: Date | null;
      isDaily: boolean;
    }[];
    oneTime: {
      rewardType: RewardTypeEnum;
      reward: RewardEntity;
      isEligible: boolean;
      isClaimed: boolean;
      eligibleDate: Date | null;
      claimedDate: Date | null;
      isDaily: boolean;
    }[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // One-time rewards: eligibility is not day-bound
    const fetchOneTimeUserRewards = () =>
      this.userRewardRepository.find({
        where: {
          userId,
          rewardType: In(this.oneTimeRewardTypes),
        },
      });

    const [rewards, dailyUserRewards, initialOneTimeUserRewards] =
      await Promise.all([
        // Fetch claimable rewards
        this.rewardRepository
          .createQueryBuilder('reward')
          .select([
            'reward.id',
            'reward.rewardType',
            'reward.points',
            'reward.description',
            'reward.isActive',
            'reward.isDaily',
            'reward.createdAt',
            'reward.updatedAt',
          ])
          .where('reward.rewardType IN (:...types)', { types: this.claimableRewardTypes })
          .andWhere('reward.isActive = :isActive', { isActive: true })
          .getMany(),
        // Daily rewards: eligibility is day-bound (today)
        this.userRewardRepository.find({
          where: {
            userId,
            rewardType: In(
              this.claimableRewardTypes.filter(
                (t) => !this.oneTimeRewardTypes.includes(t),
              ),
            ),
            eligibleDate: today,
          },
        }),
        fetchOneTimeUserRewards(),
      ]);

    let oneTimeUserRewards = initialOneTimeUserRewards;

    // Auto-claim registration reward (one-time, zero points by default).
    // The one-time read above already answers its early-return check (any
    // record for this user+type, date-independent), so skip it when a record
    // is present. When a record was created (or raced in), only the one-time
    // read is affected — re-fetch just that.
    const hasRegistrationRecord = oneTimeUserRewards.some(
      (ur) => ur.rewardType === RewardTypeEnum.REGISTRATION_REWARD,
    );
    if (!hasRegistrationRecord) {
      const registrationRecordExists =
        await this.ensureRegistrationRewardAutoClaimed(userId, today);
      if (registrationRecordExists) {
        oneTimeUserRewards = await fetchOneTimeUserRewards();
      }
    }

    const dailyRewardsMap = new Map(
      dailyUserRewards.map((ur) => [ur.rewardType, ur]),
    );
    const oneTimeRewardsMap = new Map(
      oneTimeUserRewards.map((ur) => [ur.rewardType, ur]),
    );

    const daily = [];
    const oneTime = [];

    for (const reward of rewards) {
      const key = reward.rewardType as RewardTypeEnum;
      const userReward = reward.isDaily
        ? dailyRewardsMap.get(key)
        : oneTimeRewardsMap.get(key);
      const dto = {
        rewardType: key,
        reward,
        isEligible: !!userReward,
        isClaimed: !!userReward?.claimedDate,
        eligibleDate: userReward?.eligibleDate || null,
        claimedDate: userReward?.claimedDate || null,
        isDaily: !!reward.isDaily,
      };

      if (reward.isDaily) {
        daily.push(dto);
      } else {
        oneTime.push(dto);
      }
    }

    return { daily, oneTime };
  }

  /**
   * Auto-claim registration reward (one-time). Returns true when a
   * registration user-reward record exists or was created, so callers
   * holding a pre-fetched snapshot without such a record must re-read.
   */
  private async ensureRegistrationRewardAutoClaimed(
    userId: number,
    today: Date,
  ): Promise<boolean> {
    const existing = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType: RewardTypeEnum.REGISTRATION_REWARD,
      },
    });

    if (existing) {
      return true;
    }

    const reward = await this.rewardRepository
      .createQueryBuilder('reward')
      .select([
        'reward.id',
        'reward.rewardType',
        'reward.points',
        'reward.description',
        'reward.isActive',
        'reward.isDaily',
        'reward.createdAt',
        'reward.updatedAt',
      ])
      .where('reward.rewardType = :rewardType', { rewardType: RewardTypeEnum.REGISTRATION_REWARD })
      .andWhere('reward.isActive = :isActive', { isActive: true })
      .getOne();

    if (!reward) {
      return false;
    }

    const claimed = this.userRewardRepository.create({
      userId,
      rewardType: RewardTypeEnum.REGISTRATION_REWARD,
      eligibleDate: today,
      claimedDate: today,
      pointsAwarded: reward.points || 0,
    });

    if (reward.points && reward.points > 0) {
      await this.userService.incrementUserPoints(userId, reward.points);
      await this.notificationGateway.emitProfileUpdate(userId.toString());
    }

    await this.userRewardRepository.save(claimed);
    return true;
  }

  /**
   * Клеймити нагороду
   */
  async claimReward(
    userId: number,
    rewardType: RewardTypeEnum,
  ): Promise<{ success: boolean; message: string; pointsAwarded: number }> {
    if (!this.claimableRewardTypes.includes(rewardType)) {
      throw new BadRequestException(
        `Reward type ${rewardType} is not claimable`,
      );
    }

    // Check availability
    const userReward = this.oneTimeRewardTypes.includes(rewardType)
      ? await this.userRewardRepository.findOne({
          where: { userId, rewardType },
        })
      : await this.userRewardRepository.findOne({
          where: {
            userId,
            rewardType,
            eligibleDate: (() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return today;
            })(),
          },
        });

    if (!userReward) {
      return {
        success: false,
        message: `Reward ${rewardType} is not available. Complete the required action first.`,
        pointsAwarded: 0,
      };
    }

    if (userReward.claimedDate) {
      return {
        success: false,
        message: this.oneTimeRewardTypes.includes(rewardType)
          ? `Reward ${rewardType} has already been claimed.`
          : `Reward ${rewardType} has already been claimed today.`,
        pointsAwarded: 0,
      };
    }

    // Load points
    const points = await this.getRewardPoints(rewardType);

    const claimedDate = new Date();
    claimedDate.setHours(0, 0, 0, 0);

    // Atomically claim the reward and credit points in one transaction. The
    // conditional UPDATE (claimedDate IS NULL) is the gate: only the first of
    // two concurrent claims flips it, so the reward is credited exactly once
    // per eligible day. The pre-read claimedDate check above is just a
    // fast-fail. Crediting inside the same tx means a crash can't leave the
    // reward marked claimed but unpaid.
    const claimed = await this.userRewardRepository.manager.transaction(
      async (manager) => {
        const claim = await manager
          .getRepository(UserRewardEntity)
          .createQueryBuilder()
          .update(UserRewardEntity)
          .set({ claimedDate, pointsAwarded: points })
          .where('id = :id', { id: userReward.id })
          .andWhere('claimedDate IS NULL')
          .execute();

        if (!claim.affected) {
          return false;
        }

        await manager
          .getRepository(UserEntity)
          .increment({ id: userId }, 'points', points);
        return true;
      },
    );

    if (!claimed) {
      return {
        success: false,
        message: this.oneTimeRewardTypes.includes(rewardType)
          ? `Reward ${rewardType} has already been claimed.`
          : `Reward ${rewardType} has already been claimed today.`,
        pointsAwarded: 0,
      };
    }

    await this.notificationGateway.emitProfileUpdate(userId.toString());

    return {
      success: true,
      message: `Successfully claimed ${rewardType} reward!`,
      pointsAwarded: points,
    };
  }

}
