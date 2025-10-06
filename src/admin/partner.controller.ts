import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';

@Controller('partner')
@ApiTags('Partner')
export class PartnerController {
  constructor(private readonly adminService: AdminService) {}

  @Get('referral-status')
  @ApiOperation({
    summary: 'Check referral user flag status (public)',
    description:
      'Checks whether a user (by partnerUserId) linked via referralToken has a specific activity flag.\n' +
      'Flags: posted_to_twitter (tweet successfully published), first_purchase, completed_profile.',
  })
  @ApiQuery({ name: 'ref', required: true, description: 'Referral token from partnership' })
  @ApiQuery({ name: 'puid', required: true, description: 'Partner user id provided by external partner' })
  @ApiQuery({ name: 'flag', required: true, description: 'Activity flag to check, e.g., posted_to_twitter' })
  @ApiResponse({ status: 200, description: 'Flag status returned' })
  async checkReferralStatus(
    @Query('ref') ref: string,
    @Query('puid') puid: string,
    @Query('flag') flag: string,
  ) {
    return this.adminService.checkReferralFlag({
      referralToken: ref,
      partnerUserId: puid,
      flag,
    });
  }

  @Post('referral-flag')
  @ApiOperation({
    summary: 'Set referral user flag (public, idempotent)',
    description:
      'Marks a referral activity flag for a linked user.\n' +
      'Flags: posted_to_twitter, first_purchase, completed_profile.',
  })
  @ApiResponse({ status: 200, description: 'Flag set or already set' })
  async setReferralFlag(
    @Body('ref') ref: string,
    @Body('puid') puid: string,
    @Body('flag') flag: string,
  ) {
    return this.adminService.setReferralFlag({
      referralToken: ref,
      partnerUserId: puid,
      flag,
    });
  }
}


