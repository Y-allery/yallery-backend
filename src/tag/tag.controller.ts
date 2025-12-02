import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { TagEntity } from './entities/tag.entity';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { AssignTagDto } from './dto/assign-tag.dto';

@Controller('tag')
@ApiTags('Tag')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  async findAll(): Promise<any[]> {
    return this.tagService.findAll();
  }

  @Get('search')
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Name of the tag to search for',
  })
  async searchByName(
    @Query('name') name: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<any[]> {
    const userId = req.user.id;
    return this.tagService.searchByName(name, userId);
  }

  @Post('assign')
  @ApiOperation({ summary: 'Assign a tag to a post' })
  @ApiResponse({ status: 200, description: 'Tag assigned successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Post or Tag not found.' })
  async assignTagToPost(
    @Body() assignTagDto: AssignTagDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const userId = req.user.id;
    await this.tagService.assignTagToPost(assignTagDto, userId);
    return { message: 'Tag assigned successfully.' };
  }
}
