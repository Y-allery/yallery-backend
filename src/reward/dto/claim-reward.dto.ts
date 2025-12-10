import { ApiProperty } from '@nestjs/swagger';
import { RewardTypeEnum } from '../types/reward-type.enum';

export class ClaimRewardResponseDto {
  @ApiProperty({
    description: 'Whether the reward was successfully claimed',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message describing the result',
    example: 'Successfully claimed DAILY_LOGIN reward!',
  })
  message: string;

  @ApiProperty({
    description: 'Points awarded for claiming the reward',
    example: 10,
  })
  pointsAwarded: number;
}

export class AvailableRewardDto {
  @ApiProperty({
    description: 'Type of reward',
    enum: RewardTypeEnum,
    example: RewardTypeEnum.DAILY_LOGIN,
  })
  rewardType: RewardTypeEnum;

  @ApiProperty({
    description: 'Reward details',
  })
  reward: {
    id: number;
    reward_type: string;
    points: number;
    description: string | null;
    is_active: boolean;
    is_daily: boolean;
  };

  @ApiProperty({
    description: 'Whether this reward is daily (claimable once per day)',
    example: true,
  })
  isDaily: boolean;

  @ApiProperty({
    description: 'Whether the user is eligible to claim this reward',
    example: true,
  })
  isEligible: boolean;

  @ApiProperty({
    description: 'Whether the reward has already been claimed today',
    example: false,
  })
  isClaimed: boolean;

  @ApiProperty({
    description: 'Date when reward became eligible',
    example: '2025-12-10',
    nullable: true,
  })
  eligibleDate: Date | null;

  @ApiProperty({
    description: 'Date when reward was claimed',
    example: '2025-12-10',
    nullable: true,
  })
  claimedDate: Date | null;
}

export class AvailableRewardsResponseDto {
  @ApiProperty({ type: [AvailableRewardDto] })
  daily: AvailableRewardDto[];

  @ApiProperty({ type: [AvailableRewardDto] })
  oneTime: AvailableRewardDto[];
}
