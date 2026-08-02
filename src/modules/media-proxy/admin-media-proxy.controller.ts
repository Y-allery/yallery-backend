import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { MediaProxyService } from './media-proxy.service';

@Controller('admin/media-proxy')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminMediaProxyController {
  constructor(private readonly mediaProxyService: MediaProxyService) {}

  @Post('forget-derived')
  @ApiOperation({
    summary: 'Forget remembered derived media objects',
    description:
      'Clears the in-process set of derived objects the proxy believes already exist, so the next request re-checks Spaces.\n\n' +
      'Needed whenever derived objects are deleted from the bucket to force a re-encode. Without it the process keeps redirecting to objects that are gone, and a warm-up pass driven through this same process skips exactly the keys it was meant to rebuild — the reason such migrations used to require a process restart.\n\n' +
      '`prefix` matches the derived key (`t/<variant>/<key>`), so a single variant can be invalidated without discarding the rest of the warm set. Omit it to clear everything.\n\n' +
      'The set is per process. With more than one app process, call this on each.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        prefix: {
          type: 'string',
          example: 't/t_yallery_feed_image_v2/',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Entries dropped.',
    schema: {
      type: 'object',
      properties: {
        forgotten: { type: 'number', example: 21499 },
        remaining: { type: 'number', example: 3812 },
      },
    },
  })
  forgetDerived(@Body('prefix') prefix?: string) {
    return this.mediaProxyService.forgetDerived(prefix?.trim() || undefined);
  }
}
