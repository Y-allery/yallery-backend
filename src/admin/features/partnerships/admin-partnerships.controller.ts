import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { RoleEnum } from 'src/user/types/role.enum';
import { CreatePartnershipDto } from '../../dto/create-referral.dto';
import { AdminPartnershipService } from './admin-partnership.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminPartnershipsController {
  constructor(
    private readonly adminPartnershipService: AdminPartnershipService,
  ) {}

  @Post('create-partnership')
  @ApiOperation({ summary: 'Create a new partnership' })
  @ApiResponse({
    status: 201,
    description: 'Partnership created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request.' })
  async createPartnership(@Body() dto: CreatePartnershipDto) {
    return this.adminPartnershipService.createPartnership(dto);
  }

  @Delete('partnership/:id')
  @ApiOperation({ summary: 'Delete partnership and all related data' })
  @ApiResponse({
    status: 200,
    description: 'Partnership deleted successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Partnership not found.' })
  @ApiResponse({ status: 500, description: 'Failed to delete partnership.' })
  async deletePartnership(@Param('id', ParseIntPipe) id: number) {
    return this.adminPartnershipService.deletePartnership(id);
  }

  @Get('partnerships')
  @ApiOperation({ summary: 'Get all partnerships with activity stats' })
  @ApiResponse({ status: 200, description: 'List of partnerships returned' })
  async getAllPartnerships() {
    return this.adminPartnershipService.getAllPartnershipsWithStats();
  }
}
