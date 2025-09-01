/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateUserDto } from './dto/update.user.details.dto';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { AddTagsDto } from './dto/add.tags.dto';
import { RemoveTagDto } from './dto/remove.tag.dto';
import { Cron } from '@nestjs/schedule';
import { RegisterDeviceTokenDto } from './dto/add.device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/remove.device-token.dto';
import { UpdateNotificationPreferenceDto } from './dto/change.notification.settings.dto';
import {
  ChangePasswordDto,
  UpdateNameDto,
  UpdateNicknameDto,
} from './dto/update.user.details';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseReferralCodeDto } from './dto/use-refferal-code.dto';
import { UpdateTwitterUsernameDto } from './dto/update.twitter.user.name.dto';
import { LogReferralActivityDto } from './dto/log-referral-activity.dto';

@Controller('user')
@ApiTags('User')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('generate-referral-code')
  async generateReferralCode(@Req() req: AuthenticatedRequest) {
    const code = await this.userService.generateReferralCode(req.user.id);
    return { code };
  }

  @Post('use-referral-code')
  async useReferralCode(
    @Req() req: AuthenticatedRequest,
    @Body() useReferralCodeDto: UseReferralCodeDto,
  ) {
    await this.userService.useReferralCode(
      req.user.id,
      useReferralCodeDto.code,
    );
    return { message: 'Successfuly received' };
  }

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.getUserProfile(req.user.id);
  }

  @Post('update-user-details')
  async updateUser(
    @Req() req: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const { password, nickname, name, email } = updateUserDto;

    if (!password && !nickname && !name && !email) {
      throw new BadRequestException('Nothing to update');
    }
    const updatedUser = await this.userService.updateUserDetails(
      req.user.id,
      updateUserDto,
    );

    const { password: _, refreshToken, ...userData } = updatedUser;
    const isAuthFinished = !!(
      updatedUser.nickname &&
      updatedUser.password &&
      updatedUser.email &&
      !updatedUser?.email?.includes('@telegram.local')
    );

    return { ...userData, is_auth_finished: isAuthFinished };
  }

  @Post('add-tags')
  async addTagsToUser(
    @Req() req: AuthenticatedRequest,
    @Body() addTagsDto: AddTagsDto,
  ) {
    const { tagIds } = addTagsDto;
    const updatedUser = await this.userService.addTagsToUser(
      req.user.id,
      tagIds,
    );

    return updatedUser;
  }

  @Delete('remove-tag/:tagId')
  @ApiOperation({ summary: 'Remove a tag from the user' })
  @ApiResponse({
    status: 200,
    description: 'Tag removed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User or tag not found',
  })
  async removeTagFromUser(
    @Req() req: AuthenticatedRequest,
    @Param('tagId') tagId: number,
  ) {
    const result = await this.userService.removeTagFromUser(req.user.id, tagId);

    return result;
  }

  @Delete('delete-account')
  async deleteUserAccount(@Req() req: AuthenticatedRequest) {
    const result = await this.userService.deleteUserAccount(req.user.id);

    return result;
  }

  @Post('register-device-token')
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiBody({ type: RegisterDeviceTokenDto })
  async registerDeviceToken(
    @Req() req: AuthenticatedRequest,
    @Body() registerDeviceTokenDto: RegisterDeviceTokenDto,
  ) {
    const { token, deviceType } = registerDeviceTokenDto;
    const userId = req.user.id;
    const result = await this.userService.addDeviceToken(
      userId,
      token,
      deviceType,
    );
    return result;
  }

  @Delete('unregister-device-token/by-device-type')
  @ApiOperation({
    summary: 'Unregister all device tokens for a specified device type',
  })
  @ApiResponse({
    status: 200,
    description:
      'All device tokens for the specified type were unregistered successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'No tokens found for this device type or user not found',
  })
  async unregisterDeviceTokensByType(
    @Req() req: AuthenticatedRequest,
    @Body() unregisterDeviceTokenDto: UnregisterDeviceTokenDto,
  ) {
    const { deviceType } = unregisterDeviceTokenDto;
    const userId = req.user.id;
    const result = await this.userService.removeDeviceTokensByType(
      userId,
      deviceType,
    );
    return result;
  }

  @Post('change-notification-setting')
  @ApiOperation({ summary: 'Set notification preference' })
  @ApiBody({ type: UpdateNotificationPreferenceDto })
  async setNotificationPreference(
    @Req() req: AuthenticatedRequest,
    @Body() updateNotificationPreferenceDto: UpdateNotificationPreferenceDto,
  ) {
    const userId = req.user.id;
    const { notificationsEnabled } = updateNotificationPreferenceDto;
    const result = await this.userService.updateNotificationPreference(
      userId,
      notificationsEnabled,
    );
    return result;
  }

  @Put('update-avatar')
  @ApiOperation({ summary: 'Update user avatar' })
  @UseInterceptors(FileInterceptor('avatar'))
  async updateAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const { success, url } = await this.userService.updateAvatar(
      req.user.id,
      file.buffer,
    );
    return { success, url };
  }

  @Put('change-password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const updatedUser = await this.userService.changePassword(
      req.user.id,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
    return updatedUser;
  }

  @Put('update-name')
  async updateName(
    @Req() req: AuthenticatedRequest,
    @Body() updateNameDto: UpdateNameDto,
  ) {
    const updatedUser = await this.userService.updateName(
      req.user.id,
      updateNameDto.name,
    );
    return updatedUser;
  }

  @Put('update-nickname')
  async updateNickname(
    @Req() req: AuthenticatedRequest,
    @Body() updateNicknameDto: UpdateNicknameDto,
  ) {
    const updatedUser = await this.userService.updateNickname(
      req.user.id,
      updateNicknameDto.nickname,
    );
    return updatedUser;
  }

  @Put('update-twitter-username')
  @ApiOperation({ summary: 'Update Twitter username' })
  @ApiBody({ type: UpdateTwitterUsernameDto })
  async updateTwitterUsername(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateTwitterUsernameDto,
  ) {
    return this.userService.updateTwitterUsername(
      req.user.id,
      body.twitterUsername,
    );
  }

  @Post('log-referral-activity')
  @ApiOperation({ summary: 'Log user activity by referral token' })
  @ApiResponse({ status: 201, description: 'Activity logged successfully.' })
  @ApiResponse({ status: 404, description: 'Referral not found.' })
  async logReferralActivity(
    @Body() dto: LogReferralActivityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.userService.logReferralActivity(dto, req.user.id);
  }

  @Cron('0 1 * * *')
  async handleCron() {
    await this.userService.handleDailyReward();
  }

  @Cron('0 2 * * *')
  async handleTopLikedPostReward() {
    await this.userService.processTopLikedPostRewards();
  }


}
