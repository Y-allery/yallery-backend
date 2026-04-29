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
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { TAG_SWAGGER } from 'src/shared/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { AssignTagDto } from './dto/assign-tag.dto';

@Controller('tag')
@ApiTags('Tag')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @ApiOperation(TAG_SWAGGER.findAll)
  @ApiResponse(TAG_SWAGGER.findAll.responses.success)
  async findAll(): Promise<any[]> {
    return this.tagService.findAll();
  }

  @Get('search')
  @ApiOperation(TAG_SWAGGER.searchByName)
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Name of the tag to search for',
  })
  @ApiResponse(TAG_SWAGGER.searchByName.responses.success)
  async searchByName(
    @Query('name') name: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<any[]> {
    const userId = req.user.id;
    return this.tagService.searchByName(name, userId);
  }

  @Post('assign')
  @ApiOperation(TAG_SWAGGER.assignTagToPost)
  @ApiBody({ type: AssignTagDto })
  @ApiResponse(TAG_SWAGGER.assignTagToPost.responses.success)
  @ApiResponse(TAG_SWAGGER.assignTagToPost.responses.badRequest)
  @ApiResponse(TAG_SWAGGER.assignTagToPost.responses.forbidden)
  @ApiResponse(TAG_SWAGGER.assignTagToPost.responses.notFound)
  async assignTagToPost(
    @Body() assignTagDto: AssignTagDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const userId = req.user.id;
    await this.tagService.assignTagToPost(assignTagDto, userId);
    return { message: 'Tag assigned successfully.' };
  }
}
