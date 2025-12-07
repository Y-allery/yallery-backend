import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { LikeService } from './like.service';
import { CreateLikeDto } from './dto/create.like.dto';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { LIKE_SWAGGER } from 'src/common/swagger';

@Controller('like')
@ApiTags('Like')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation(LIKE_SWAGGER.createLike)
  @ApiBody({ type: CreateLikeDto })
  @ApiResponse(LIKE_SWAGGER.createLike.responses.success)
  @ApiResponse(LIKE_SWAGGER.createLike.responses.badRequest)
  @ApiResponse(LIKE_SWAGGER.createLike.responses.notFound)
  async createLike(
    @Body() createLikeDto: CreateLikeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.likeService.createLike(createLikeDto, req.user.id);
  }
}
