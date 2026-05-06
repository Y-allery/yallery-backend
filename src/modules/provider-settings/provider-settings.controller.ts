import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { UpdateProviderSettingDto } from './dto/update-provider-setting.dto';
import { ProviderRuntimeConfigService } from './provider-runtime-config.service';

@Controller('admin/provider-settings')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class ProviderSettingsController {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get provider runtime settings' })
  async getProviderSettings() {
    return this.providerRuntimeConfigService.listSettings();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Update provider runtime setting' })
  async updateProviderSetting(
    @Param('key') key: string,
    @Body() dto: UpdateProviderSettingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.providerRuntimeConfigService.updateSetting(
      key,
      dto,
      req.user?.id ?? null,
    );
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Clear provider runtime setting override' })
  async clearProviderSetting(@Param('key') key: string) {
    return this.providerRuntimeConfigService.clearSetting(key);
  }

  @Post(':key/validate')
  @ApiOperation({ summary: 'Validate provider runtime setting' })
  async validateProviderSetting(@Param('key') key: string) {
    return this.providerRuntimeConfigService.validateSetting(key);
  }
}
