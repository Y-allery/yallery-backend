import { Controller, Get, Put, Post, Param, Body, UseGuards, NotFoundException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RewardService } from './reward.service';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { ClaimRewardResponseDto, AvailableRewardsResponseDto } from './dto/claim-reward.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/decorators/role.decorator';
import { RoleEnum } from 'src/user/types/role.enum';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';

@Controller('rewards')
@ApiTags('Rewards')
@UseGuards(JwtAuthGuard, RoleGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get('available')
  @ApiOperation({ 
    summary: 'Get available rewards', 
    description: 'Get all claimable rewards for the current user with eligibility status' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of available rewards grouped by daily/one-time',
    type: AvailableRewardsResponseDto,
  })
  async getAvailableRewards(@Req() req: AuthenticatedRequest): Promise<AvailableRewardsResponseDto> {
    return this.rewardService.getAvailableRewards(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all rewards', description: 'Retrieve all reward types with their point values' })
  @ApiResponse({ status: 200, description: 'List of all rewards' })
  async getAllRewards() {
    return this.rewardService.getAllRewards();
  }

  @Get(':rewardType')
  @ApiOperation({ summary: 'Get reward by type', description: 'Retrieve a specific reward type (Payment rewards are not available via GET)' })
  @ApiParam({ name: 'rewardType', enum: RewardTypeEnum, description: 'Type of reward' })
  @ApiResponse({ status: 200, description: 'Reward details' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  async getRewardByType(@Param('rewardType') rewardType: RewardTypeEnum) {
    const reward = await this.rewardService.getRewardByType(rewardType);
    if (!reward) {
      throw new NotFoundException(`Reward type ${rewardType} not found or not available`);
    }
    return reward;
  }

  @Post('claim/:rewardType')
  @ApiOperation({ 
    summary: 'Claim reward', 
    description: 'Claim a reward if eligible. Rewards can be claimed once per day.' 
  })
  @ApiParam({ name: 'rewardType', enum: RewardTypeEnum, description: 'Type of reward to claim' })
  @ApiResponse({ 
    status: 200, 
    description: 'Reward claimed successfully',
    type: ClaimRewardResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Reward not available or already claimed' })
  async claimReward(
    @Req() req: AuthenticatedRequest,
    @Param('rewardType') rewardType: RewardTypeEnum,
  ): Promise<ClaimRewardResponseDto> {
    return this.rewardService.claimReward(req.user.id, rewardType);
  }

  @Put(':rewardType')
  @Roles(RoleEnum.ADMIN)
  @ApiOperation({ summary: 'Update reward', description: 'Update points, description, or active status of a reward (Admin only)' })
  @ApiParam({ name: 'rewardType', enum: RewardTypeEnum, description: 'Type of reward to update' })
  @ApiBody({ type: UpdateRewardDto })
  @ApiResponse({ status: 200, description: 'Reward updated successfully' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  async updateReward(
    @Param('rewardType') rewardType: RewardTypeEnum,
    @Body() updateDto: UpdateRewardDto,
  ) {
    return this.rewardService.updateReward(rewardType, updateDto);
  }
}
