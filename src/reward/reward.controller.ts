import { Controller, Get, Put, Post, Param, Body, UseGuards, NotFoundException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RewardService } from './reward.service';
import { RewardTypeEnum } from './types/reward-type.enum';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { ClaimRewardResponseDto, AvailableRewardsResponseDto } from './dto/claim-reward.dto';
import { GetAllRewardsResponseDto } from './dto/get-all-rewards.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/decorators/role.decorator';
import { RoleEnum } from 'src/user/types/role.enum';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';

const CLAIMABLE_REWARD_TYPES: RewardTypeEnum[] = [
  RewardTypeEnum.DAILY_LOGIN,
  RewardTypeEnum.POST_VIDEO_REWARD,
  RewardTypeEnum.POST_PHOTO_REWARD,
  RewardTypeEnum.CONTEST_PARTICIPATION,
  RewardTypeEnum.REGISTRATION_REWARD,
  RewardTypeEnum.RATE_APP,
];

@Controller('rewards')
@ApiTags('Rewards')
@UseGuards(JwtAuthGuard, RoleGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get('available')
  @ApiOperation({ 
    summary: 'Get available rewards', 
    description: 'Get claimable rewards grouped by daily/one-time with eligibility status' 
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
  @ApiOperation({ 
    summary: 'Get all rewards', 
    description: 'Retrieve all reward types grouped by daily/one-time/other with their point values' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Rewards grouped by type',
    type: GetAllRewardsResponseDto,
  })
  async getAllRewards(): Promise<GetAllRewardsResponseDto> {
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
    summary: 'Claim reward (eligible only)', 
    description: 'Claim only if eligible. Daily rewards — once per day; one-time — after completing the required action.' 
  })
  @ApiParam({ name: 'rewardType', enum: CLAIMABLE_REWARD_TYPES, description: 'Claimable reward type' })
  @ApiResponse({ 
    status: 200, 
    description: 'Reward claimed successfully',
    type: ClaimRewardResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Reward not available or already claimed (not eligible)' })
  async claimReward(
    @Req() req: AuthenticatedRequest,
    @Param('rewardType') rewardType: RewardTypeEnum,
  ): Promise<ClaimRewardResponseDto> {
    return this.rewardService.claimReward(req.user.id, rewardType);
  }

  @Post('mark/rate-app')
  @ApiOperation({
    summary: 'Mark rate-app flow completed',
    description: 'Marks the rate-app reward as eligible after user taps rate flow.',
  })
  @ApiResponse({ status: 200, description: 'Marked as eligible' })
  async markRateApp(@Req() req: AuthenticatedRequest) {
    await this.rewardService.markRewardEligible(req.user.id, RewardTypeEnum.RATE_APP);
    return { success: true };
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
