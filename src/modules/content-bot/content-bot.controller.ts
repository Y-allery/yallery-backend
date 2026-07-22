import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { ContentBotService } from './content-bot.service';

/**
 * Admin-only controls for the content bot. The preview endpoint is the intended
 * first run: it generates drafts (never published) so they can be reviewed in
 * Telegram before CONTENT_BOT_ENABLED is flipped on.
 */
@Controller('content-bot')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class ContentBotController {
  constructor(private readonly bot: ContentBotService) {}

  @Post('ensure-user')
  @ApiOperation({ summary: 'Create/resolve the content-bot user' })
  async ensureUser() {
    const userId = await this.bot.ensureBotUser();
    return { userId };
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Generate N draft items now (not published) for review',
  })
  async preview(@Query('count') count?: string) {
    const n = Math.max(1, Math.min(Number(count) || 5, 20));
    return this.bot.runPreview(n);
  }

  @Post('digest')
  @ApiOperation({ summary: "Send today's Telegram digest now" })
  async digest() {
    return this.bot.sendDigest();
  }

  @Post('publish-now')
  @ApiOperation({ summary: 'Run a paced publish tick manually' })
  async publishNow() {
    // Mirror the cron pairing (content-bot.cron.ts publish()) so a manual
    // trigger sees the same up-to-date plan statuses the cron would.
    await this.bot.reconcileGenerating();
    return this.bot.publishDuePaced();
  }

  @Get('status')
  @ApiOperation({ summary: 'Content bot status + config + today plan' })
  async status() {
    return this.bot.status();
  }
}
