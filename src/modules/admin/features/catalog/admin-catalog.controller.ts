import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { CreateStyleDto } from 'src/modules/posts/dto/create.style.dto';
import { CreateTagDto } from 'src/modules/catalog/tags/dto/create.tag.dto';
import { UpdateTagDto } from 'src/modules/catalog/tags/dto/update.tag.dto';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { AdminCatalogService } from './admin-catalog.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminCatalogController {
  constructor(private readonly adminCatalogService: AdminCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve all tags' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all tags.' })
  async getTags() {
    return this.adminCatalogService.getAllTags();
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create tag' })
  async createTag(@Body() createTagDto: CreateTagDto) {
    return this.adminCatalogService.createTag(createTagDto);
  }

  @Put('tags/:id')
  @ApiOperation({ summary: 'Update tag' })
  async updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.adminCatalogService.updateTag(id, updateTagDto);
  }

  @Delete('tags/:id')
  @ApiOperation({ summary: 'Delete tag' })
  async deleteTag(@Param('id', ParseIntPipe) id: number) {
    return this.adminCatalogService.deleteTag(id);
  }

  @Post('styles')
  @ApiOperation({ summary: 'Create a new style' })
  @ApiResponse({ status: 201, description: 'Style created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  async createStyle(@Body() createStyleDto: CreateStyleDto) {
    return this.adminCatalogService.createStyle(createStyleDto);
  }

  @Get('styles')
  @ApiOperation({ summary: 'Retrieve all styles' })
  @ApiResponse({ status: 200, description: 'Styles retrieved successfully.' })
  async getStyles() {
    return this.adminCatalogService.findAllStyles();
  }

  @Get('styles/:id')
  @ApiOperation({ summary: 'Retrieve a style by ID' })
  @ApiResponse({ status: 200, description: 'Style retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async getStyle(@Param('id', ParseIntPipe) id: number) {
    return this.adminCatalogService.findStyleById(id);
  }

  @Put('styles/:id')
  @ApiOperation({ summary: 'Update a style' })
  @ApiResponse({ status: 200, description: 'Style updated successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async updateStyle(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: CreateStyleDto,
  ) {
    return this.adminCatalogService.updateStyle(id, updateTagDto);
  }

  @Delete('styles/:id')
  @ApiOperation({ summary: 'Delete a style' })
  @ApiResponse({ status: 200, description: 'Style deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Style not found.' })
  async deleteStyle(@Param('id', ParseIntPipe) id: number) {
    return this.adminCatalogService.deleteStyle(id);
  }
}
