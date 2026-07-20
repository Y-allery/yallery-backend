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
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { USER_SWAGGER } from 'src/shared/swagger';
import { UpdateUserDto } from './dto/update.user.details.dto';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { AddTagsDto } from './dto/add.tags.dto';
import { RemoveTagDto } from './dto/remove.tag.dto';
import { Cron } from '@nestjs/schedule';
import { RegisterDeviceTokenDto } from './dto/add.device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/remove.device-token.dto';
import {
  ChangePasswordDto,
  UpdateNameDto,
  UpdateNicknameDto,
} from './dto/update.user.details';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseReferralCodeDto } from './dto/use-refferal-code.dto';
import { UpdateTwitterUsernameDto } from './dto/update.twitter.user.name.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { LogReferralActivityDto } from './dto/log-referral-activity.dto';

@Controller('user')
@ApiTags('User')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('generate-referral-code')
  @ApiOperation(USER_SWAGGER.generateReferralCode)
  @ApiResponse(USER_SWAGGER.generateReferralCode.responses.success)
  async generateReferralCode(@Req() req: AuthenticatedRequest) {
    const code = await this.userService.generateReferralCode(req.user.id);
    return { code };
  }

  @Post('use-referral-code')
  @ApiOperation(USER_SWAGGER.useReferralCode)
  @ApiBody({ type: UseReferralCodeDto })
  @ApiResponse(USER_SWAGGER.useReferralCode.responses.success)
  @ApiResponse(USER_SWAGGER.useReferralCode.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.getProfile)
  @ApiResponse(USER_SWAGGER.getProfile.responses.success)
  @ApiResponse(USER_SWAGGER.getProfile.responses.unauthorized)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.getUserProfile(req.user.id);
  }

  @Post('update-user-details')
  @ApiOperation(USER_SWAGGER.updateUserDetails)
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse(USER_SWAGGER.updateUserDetails.responses.success)
  @ApiResponse(USER_SWAGGER.updateUserDetails.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.addTagsToUser)
  @ApiBody({ type: AddTagsDto })
  @ApiResponse(USER_SWAGGER.addTagsToUser.responses.success)
  @ApiResponse(USER_SWAGGER.addTagsToUser.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.removeTagFromUser)
  @ApiParam({ name: 'tagId', type: Number })
  @ApiResponse(USER_SWAGGER.removeTagFromUser.responses.success)
  @ApiResponse(USER_SWAGGER.removeTagFromUser.responses.notFound)
  async removeTagFromUser(
    @Req() req: AuthenticatedRequest,
    @Param('tagId') tagId: number,
  ) {
    const result = await this.userService.removeTagFromUser(req.user.id, tagId);

    return result;
  }

  @Delete('delete-account')
  @ApiOperation(USER_SWAGGER.deleteUserAccount)
  @ApiResponse(USER_SWAGGER.deleteUserAccount.responses.success)
  @ApiResponse(USER_SWAGGER.deleteUserAccount.responses.unauthorized)
  async deleteUserAccount(@Req() req: AuthenticatedRequest) {
    const result = await this.userService.deleteUserAccount(req.user.id);

    return result;
  }

  @Post('register-device-token')
  @ApiOperation(USER_SWAGGER.registerDeviceToken)
  @ApiBody({ type: RegisterDeviceTokenDto })
  @ApiResponse(USER_SWAGGER.registerDeviceToken.responses.success)
  @ApiResponse(USER_SWAGGER.registerDeviceToken.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.unregisterDeviceTokensByType)
  @ApiBody({ type: UnregisterDeviceTokenDto })
  @ApiResponse(USER_SWAGGER.unregisterDeviceTokensByType.responses.success)
  @ApiResponse(USER_SWAGGER.unregisterDeviceTokensByType.responses.notFound)
  async unregisterDeviceTokensByType(
    @Req() req: AuthenticatedRequest,
    @Body() unregisterDeviceTokenDto: UnregisterDeviceTokenDto,
  ) {
    const { deviceType, token } = unregisterDeviceTokenDto;
    const userId = req.user.id;
    const result = await this.userService.removeDeviceTokensByType(
      userId,
      deviceType,
      token,
    );
    return result;
  }

  @Put('update-avatar')
  @ApiOperation(USER_SWAGGER.updateAvatar)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiResponse(USER_SWAGGER.updateAvatar.responses.success)
  @ApiResponse(USER_SWAGGER.updateAvatar.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.changePassword)
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse(USER_SWAGGER.changePassword.responses.success)
  @ApiResponse(USER_SWAGGER.changePassword.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.updateName)
  @ApiBody({ type: UpdateNameDto })
  @ApiResponse(USER_SWAGGER.updateName.responses.success)
  @ApiResponse(USER_SWAGGER.updateName.responses.badRequest)
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
  @ApiOperation(USER_SWAGGER.updateNickname)
  @ApiBody({ type: UpdateNicknameDto })
  @ApiResponse(USER_SWAGGER.updateNickname.responses.success)
  @ApiResponse(USER_SWAGGER.updateNickname.responses.badRequest)
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

  @Put('update-language')
  @ApiOperation({ summary: "Update the user's preferred app language" })
  @ApiBody({ type: UpdateLanguageDto })
  async updateLanguage(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateLanguageDto,
  ) {
    return this.userService.updateLanguage(req.user.id, body.language);
  }

  @Put('update-twitter-username')
  @ApiOperation(USER_SWAGGER.updateTwitterUsername)
  @ApiBody({ type: UpdateTwitterUsernameDto })
  @ApiResponse(USER_SWAGGER.updateTwitterUsername.responses.success)
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
  @ApiOperation(USER_SWAGGER.logReferralActivity)
  @ApiBody({ type: LogReferralActivityDto })
  @ApiResponse(USER_SWAGGER.logReferralActivity.responses.success)
  @ApiResponse(USER_SWAGGER.logReferralActivity.responses.notFound)
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
}
