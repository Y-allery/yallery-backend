import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { RewardEntity } from './entities/reward.entity';
import { UserRewardEntity } from './entities/user-reward.entity';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class RewardService {
  private readonly excludedRewardTypes = [
    RewardTypeEnum.PAYMENT_5000,
    RewardTypeEnum.PAYMENT_15000,
    RewardTypeEnum.PAYMENT_30000,
  ];

  // Нагороди які можна клеймити в reward center
  private readonly claimableRewardTypes = [
    RewardTypeEnum.DAILY_LOGIN,
    RewardTypeEnum.POST_VIDEO_REWARD,
    RewardTypeEnum.POST_PHOTO_REWARD,
    RewardTypeEnum.CONTEST_PARTICIPATION,
    RewardTypeEnum.REGISTRATION_REWARD,
  ];

  constructor(
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
    @InjectRepository(UserRewardEntity)
    private readonly userRewardRepository: Repository<UserRewardEntity>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  async getAllRewards(): Promise<RewardEntity[]> {
    return this.rewardRepository.find({
      where: {
        reward_type: Not(In(this.excludedRewardTypes)),
      },
      order: { reward_type: 'ASC' },
    });
  }

  async getRewardByType(rewardType: RewardTypeEnum): Promise<RewardEntity | null> {
    // Не повертаємо Payment нагороди через GET
    if (this.excludedRewardTypes.includes(rewardType)) {
      return null;
    }
    return this.rewardRepository.findOne({
      where: { reward_type: rewardType, is_active: true },
    });
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
    return this.rewardRepository.findOne({
      where: { reward_type: rewardType, is_active: true },
    });
  }

  async updateReward(
    rewardType: RewardTypeEnum,
    updateDto: UpdateRewardDto,
  ): Promise<RewardEntity> {
    const reward = await this.rewardRepository.findOne({
      where: { reward_type: rewardType },
    });

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
      reward.is_active = updateDto.is_active;
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
   * Відмітити що нагорода стала доступною для користувача
   */
  async markRewardEligible(
    userId: number,
    rewardType: RewardTypeEnum,
  ): Promise<UserRewardEntity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Перевіряємо чи вже існує запис на сьогодні
    const existing = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType,
        eligibleDate: today,
      },
    });

    if (existing) {
      return existing; // Вже відмічено
    }

    // Створюємо новий запис
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
   * Отримати доступні нагороди для користувача (які можна клеймити)
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

    // Забезпечуємо автоклейм реєстраційного реварду (одноразовий, без поінтів)
    await this.ensureRegistrationRewardAutoClaimed(userId, today);

    // Отримуємо всі claimable нагороди
    const rewards = await this.rewardRepository.find({
      where: {
        reward_type: In(this.claimableRewardTypes),
        is_active: true,
      },
    });

    // Отримуємо записи user_rewards для сьогодні
    const userRewards = await this.userRewardRepository.find({
      where: {
        userId,
        rewardType: In(this.claimableRewardTypes),
        eligibleDate: today,
      },
    });

    const userRewardsMap = new Map(
      userRewards.map((ur) => [ur.rewardType, ur]),
    );

    const daily = [];
    const oneTime = [];

    for (const reward of rewards) {
      const userReward = userRewardsMap.get(reward.reward_type as RewardTypeEnum);
      const dto = {
        rewardType: reward.reward_type as RewardTypeEnum,
        reward,
        isEligible: !!userReward,
        isClaimed: !!userReward?.claimedDate,
        eligibleDate: userReward?.eligibleDate || null,
        claimedDate: userReward?.claimedDate || null,
        isDaily: !!reward.is_daily,
      };

      if (reward.is_daily) {
        daily.push(dto);
      } else {
        oneTime.push(dto);
      }
    }

    return { daily, oneTime };
  }

  /**
   * Автоматично відмічає реєстраційний ревард як заклеймлений (одноразовий)
   */
  private async ensureRegistrationRewardAutoClaimed(
    userId: number,
    today: Date,
  ): Promise<void> {
    const existing = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType: RewardTypeEnum.REGISTRATION_REWARD,
      },
    });

    if (existing) {
      return;
    }

    const reward = await this.rewardRepository.findOne({
      where: {
        reward_type: RewardTypeEnum.REGISTRATION_REWARD,
        is_active: true,
      },
    });

    if (!reward) {
      return;
    }

    // Створюємо заклеймлений запис без нарахування поінтів
    const claimed = this.userRewardRepository.create({
      userId,
      rewardType: RewardTypeEnum.REGISTRATION_REWARD,
      eligibleDate: today,
      claimedDate: today,
      pointsAwarded: reward.points || 0,
    });

    // Якщо хочемо нарахувати поінти (>0) — нараховуємо
    if (reward.points && reward.points > 0) {
      await this.userService.incrementUserPoints(userId, reward.points);
    }

    await this.userRewardRepository.save(claimed);
  }

  /**
   * Перевірити чи доступна нагорода для клеймування
   */
  async isRewardEligible(
    userId: number,
    rewardType: RewardTypeEnum,
  ): Promise<boolean> {
    if (!this.claimableRewardTypes.includes(rewardType)) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userReward = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType,
        eligibleDate: today,
      },
    });

    return !!userReward && !userReward.claimedDate;
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Перевіряємо чи доступна нагорода
    const userReward = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType,
        eligibleDate: today,
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
        message: `Reward ${rewardType} has already been claimed today.`,
        pointsAwarded: 0,
      };
    }

    // Отримуємо кількість поінтів
    const points = await this.getRewardPoints(rewardType);

    // Додаємо поінти користувачу
    await this.userService.incrementUserPoints(userId, points);

    // Оновлюємо запис
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    userReward.claimedDate = todayDate;
    userReward.pointsAwarded = points;
    await this.userRewardRepository.save(userReward);

    return {
      success: true,
      message: `Successfully claimed ${rewardType} reward!`,
      pointsAwarded: points,
    };
  }

  /**
   * Перевірити чи клеймована нагорода сьогодні
   */
  async hasClaimedRewardToday(
    userId: number,
    rewardType: RewardTypeEnum,
  ): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userReward = await this.userRewardRepository.findOne({
      where: {
        userId,
        rewardType,
        eligibleDate: today,
      },
    });

    return !!userReward?.claimedDate;
  }
}
