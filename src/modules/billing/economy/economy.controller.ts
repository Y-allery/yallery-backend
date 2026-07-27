import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { EconomyService } from './economy.service';
import { EconomyResponse } from './economy.types';

@ApiTags('Economy')
@Controller('economy')
@UseGuards(JwtAuthGuard)
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get()
  @ApiOperation({
    summary: 'Points economy in one call',
    description:
      'Every rule that moves a balance: what earns points (likes received, daily login, posting, contests, referrals), what spends them (giving a like) and what each generation costs. Values are read live from the same rows the backend charges against, so they cannot drift from the server. Per-capability model pickers should still use the /media-generation/*/ai-settings endpoints; this is the one call a wallet or pricing screen needs.',
  })
  @ApiResponse({ status: 200, description: 'Current economy configuration' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getEconomy(): Promise<EconomyResponse> {
    return this.economyService.getEconomy();
  }
}
