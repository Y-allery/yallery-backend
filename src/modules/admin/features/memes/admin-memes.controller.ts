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
import { CreateMemeDto } from 'src/modules/memes/dto/create-meme.dto';
import { UpdateMemeDto } from 'src/modules/memes/dto/update-meme.dto';
import { MemeService } from 'src/modules/memes/meme.service';
import { ContentTranslationQueue } from 'src/modules/translations/content-translation.queue';
import { RoleEnum } from 'src/modules/users/types/role.enum';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminMemesController {
  constructor(
    private readonly memeService: MemeService,
    private readonly contentTranslationQueue: ContentTranslationQueue,
  ) {}

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
    const meme = await this.memeService.create(dto);
    if (meme?.id) await this.contentTranslationQueue.enqueue('meme', meme.id);
    return meme;
  }

  @Put('memes/:id')
  @ApiOperation({ summary: 'Update meme template' })
  @ApiResponse({ status: 200, description: 'Meme updated' })
  async updateMeme(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemeDto,
  ) {
    const meme = await this.memeService.update(id, dto);
    await this.contentTranslationQueue.enqueue('meme', id);
    return meme;
  }

  @Delete('memes/:id')
  @ApiOperation({ summary: 'Delete meme template' })
  @ApiResponse({ status: 200, description: 'Meme deleted' })
  async deleteMeme(@Param('id', ParseIntPipe) id: number) {
    await this.memeService.remove(id);
    return { success: true };
  }
}
