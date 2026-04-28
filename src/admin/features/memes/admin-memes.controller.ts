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
import { Roles } from 'src/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { CreateMemeDto } from 'src/meme/dto/create-meme.dto';
import { UpdateMemeDto } from 'src/meme/dto/update-meme.dto';
import { MemeService } from 'src/meme/meme.service';
import { RoleEnum } from 'src/user/types/role.enum';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminMemesController {
  constructor(private readonly memeService: MemeService) {}

  @Get('memes')
  @ApiOperation({ summary: 'List all meme templates' })
  @ApiResponse({ status: 200, description: 'List of memes' })
  async getMemes() {
    return this.memeService.findAll(false);
  }

  @Post('memes')
  @ApiOperation({ summary: 'Create meme template' })
  @ApiResponse({ status: 201, description: 'Meme created' })
  async createMeme(@Body() dto: CreateMemeDto) {
    return this.memeService.create(dto);
  }

  @Put('memes/:id')
  @ApiOperation({ summary: 'Update meme template' })
  @ApiResponse({ status: 200, description: 'Meme updated' })
  async updateMeme(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemeDto,
  ) {
    return this.memeService.update(id, dto);
  }

  @Delete('memes/:id')
  @ApiOperation({ summary: 'Delete meme template' })
  @ApiResponse({ status: 200, description: 'Meme deleted' })
  async deleteMeme(@Param('id', ParseIntPipe) id: number) {
    await this.memeService.remove(id);
    return { success: true };
  }
}
