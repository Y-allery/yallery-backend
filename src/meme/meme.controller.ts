import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { Req } from '@nestjs/common';
import { MemeService } from './meme.service';
import { GenerateMemeDto } from './dto/generate-meme.dto';

@ApiTags('Meme')
@Controller('memes')
export class MemeController {
  constructor(private readonly memeService: MemeService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Meme default settings (e.g. cost)' })
  @ApiResponse({ status: 200, description: '{ defaultSettings: { cost: number } }' })
  getSettings() {
    return this.memeService.getSettings();
  }

  @Get()
  @ApiOperation({
    summary: 'List memes: popular (top 6 by generations this month) + regular, with generationsCount',
  })
  @ApiResponse({ status: 200, description: '{ popular: Meme[], regular: Meme[] }; each meme has generationsCount' })
  listAvailable() {
    return this.memeService.listForApp();
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit user image for meme generation (queued)' })
  @ApiBody({ type: GenerateMemeDto })
  @ApiResponse({ status: 201, description: 'Generation job queued' })
  @ApiResponse({ status: 400, description: 'Invalid meme or missing reference video' })
  async generate(
    @Body() dto: GenerateMemeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.memeService.addGenerationToQueue(
      dto.memeId,
      dto.imageUrl,
      req.user.id,
      dto.prompt,
      dto.characterOrientation,
    );
  }
}
