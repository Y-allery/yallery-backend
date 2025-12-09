import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardEntity } from './entities/reward.entity';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';

@Injectable()
export class RewardService {
  constructor(
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
  ) {}

  async getAllRewards(): Promise<RewardEntity[]> {
    return this.rewardRepository.find({
      order: { reward_type: 'ASC' },
    });
  }

  async getRewardByType(rewardType: RewardTypeEnum): Promise<RewardEntity | null> {
    return this.rewardRepository.findOne({
      where: { reward_type: rewardType, is_active: true },
    });
  }

  async getRewardPoints(rewardType: RewardTypeEnum): Promise<number> {
    const reward = await this.getRewardByType(rewardType);
    if (!reward) {
      throw new NotFoundException(`Reward type ${rewardType} not found or inactive`);
    }
    return reward.points;
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
