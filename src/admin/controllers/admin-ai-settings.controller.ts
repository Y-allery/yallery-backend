import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { RoleEnum } from 'src/user/types/role.enum';
import { UpdateAISettingsDto } from '../dto/update-ai-settings.dto';
import { AdminAISettingsService } from '../services/admin-ai-settings.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminAISettingsController {
  constructor(
    private readonly adminAISettingsService: AdminAISettingsService,
  ) {}

  @Get('ai-settings')
  @ApiOperation({
    summary: 'Get all AI settings',
    description:
      'Retrieves all AI model settings from media_ai_settings grouped by image, video, meme, music, and fine-tune contest models.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI settings retrieved successfully',
  })
  async getAllAISettings() {
    return this.adminAISettingsService.getAllAISettings();
  }

  @Put('ai-settings/:id')
  @ApiOperation({
    summary: 'Update AI settings',
    description:
      'Updates AI model settings. All fields except id are optional and can be edited. Only provided fields will be updated.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: Number,
    description: 'The ID of the AI settings to update',
  })
  @ApiResponse({ status: 200, description: 'AI settings updated successfully' })
  @ApiResponse({ status: 404, description: 'AI settings not found' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error or duplicate ai_service',
  })
  async updateAISettings(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateAISettingsDto,
  ) {
    return this.adminAISettingsService.updateAISettings(id, updateDto);
  }
}
