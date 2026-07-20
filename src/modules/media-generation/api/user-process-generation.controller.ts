import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { MediaGenerationTasksService } from 'src/modules/media-generation/application/tasks/media-generation-tasks.service';

/**
 * Root-level path (not under /media-generation) because the client contract
 * was agreed as GET /user-process-generation.
 */
@Controller()
@ApiTags('Media Generation')
@UseGuards(JwtAuthGuard)
export class UserProcessGenerationController {
  constructor(
    private readonly mediaGenerationTasksService: MediaGenerationTasksService,
  ) {}

  @Get('user-process-generation')
  @ApiOperation({
    summary: 'Generations of the current user that are still running or failed',
    description:
      'For rebuilding UI after a session gap: a client that missed the ' +
      'websocket events can tell which spinners to keep, which to turn into ' +
      'an error, and which to drop. Successful generations are NOT listed — ' +
      'their results arrive over the socket or the undelivered channel. ' +
      'Covers the last 24 hours, newest first.',
  })
  @ApiResponse({
    status: 200,
    description:
      '`taskIds` lists the failed ones only; `tasks` carries every unfinished ' +
      'generation with its status (processing | failed).',
    schema: {
      example: {
        taskIds: ['3f1c…'],
        tasks: [
          {
            taskId: '3f1c…',
            status: 'failed',
            aiService: 'qwen_image',
            createdAt: '2026-07-20T12:00:00.000Z',
          },
          {
            taskId: '9ab2…',
            status: 'processing',
            aiService: 'p_video_text',
            createdAt: '2026-07-20T12:05:00.000Z',
          },
        ],
      },
    },
  })
  async getUserProcessGeneration(@Req() req: AuthenticatedRequest) {
    const tasks = await this.mediaGenerationTasksService.getUnfinishedTasks(
      req.user.id,
    );

    return {
      taskIds: tasks
        .filter((task) => task.status === 'failed')
        .map((task) => task.taskId),
      tasks,
    };
  }
}
