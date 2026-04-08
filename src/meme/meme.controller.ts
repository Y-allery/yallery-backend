import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MemeService } from './meme.service';

@ApiTags('Meme')
@Controller('memes')
export class MemeController {
  constructor(private readonly memeService: MemeService) {}

  @Get()
  @ApiOperation({
    summary: 'List memes: popular (top 6 by generations this month) + regular, with generationsCount',
  })
  @ApiResponse({ status: 200, description: '{ popular: Meme[], regular: Meme[] }; each meme has generationsCount' })
  listAvailable() {
    return this.memeService.listForApp();
  }
}
