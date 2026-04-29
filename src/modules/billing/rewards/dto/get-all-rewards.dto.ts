import { ApiProperty } from '@nestjs/swagger';
import { RewardEntity } from '../entities/reward.entity';

export class GetAllRewardsResponseDto {
  @ApiProperty({ 
    type: [RewardEntity],
    description: 'Daily rewards (claimable once per day)'
  })
  daily: RewardEntity[];

  @ApiProperty({ 
    type: [RewardEntity],
    description: 'One-time rewards (claimable once ever)'
  })
  oneTime: RewardEntity[];

  @ApiProperty({ 
    type: [RewardEntity],
    description: 'Other rewards (automatic, not claimable)'
  })
  other: RewardEntity[];
}
