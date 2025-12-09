import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { RewardEntity } from './entities/reward.entity';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';

@Injectable()
export class RewardService {
  private readonly excludedRewardTypes = [
    RewardTypeEnum.PAYMENT_5000,
    RewardTypeEnum.PAYMENT_15000,
    RewardTypeEnum.PAYMENT_30000,
    RewardTypeEnum.VIDEO_GENERATE_SPEND, // Вартість береться з ai_settings
  ];

  constructor(
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
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
    // Не повертаємо виключені нагороди через GET (Payment та VIDEO_GENERATE_SPEND)
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
}
