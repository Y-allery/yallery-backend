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

  @Get()
  @ApiOperation({ summary: 'List available meme templates (active only)' })
  @ApiResponse({ status: 200, description: 'List of active memes' })
  listAvailable() {
    return this.memeService.findAll(true);
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
    );
  }
}
