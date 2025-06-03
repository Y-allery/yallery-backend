import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { LikeService } from './like.service';
import { CreateLikeDto } from './dto/create.like.dto';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';

@Controller('like')
@ApiTags('Like')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createLike(
    @Body() createLikeDto: CreateLikeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.likeService.createLike(createLikeDto, req.user.id);
  }
}
