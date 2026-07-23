import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/modules/auth/decorators/role.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { RoleGuard } from 'src/modules/auth/guards/role.guard';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import { CreateAIFinetuneDto } from 'src/modules/admin/dto/create-ai-finetune.dto';
import { PreviewAIFinetuneLoraKeyDto } from 'src/modules/admin/dto/preview-ai-finetune-lora-key.dto';
import { AIFinetuneStatus } from 'src/modules/admin/entities/ai-finetune.entity';
import { AdminFineTuneService } from './admin-finetune.service';

@Controller('admin')
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(RoleEnum.ADMIN)
export class AdminFineTunesController {
  constructor(private readonly adminFineTuneService: AdminFineTuneService) {}

  @Get('finetunes')
  @ApiOperation({
    summary: 'List reusable AI fine-tunes',
    description:
      'Returns model-aware LoRA fine-tunes and their compatibility metadata.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Optional status filter',
    enum: ['pending', 'queued', 'training', 'ready', 'failed'],
  })
  async getFineTunes(@Query('status') status?: AIFinetuneStatus) {
    return this.adminFineTuneService.getFineTunes(status);
  }

  @Get('finetunes/lora-key')
  @ApiOperation({
    summary: 'Preview a unique LoRA key for a trigger word',
    description:
      'Backend-generated preview. The key is reserved only when the fine-tune is created.',
  })
  @ApiQuery({ name: 'triggerWord', required: true })
  async previewFineTuneLoraKey(@Query() query: PreviewAIFinetuneLoraKeyDto) {
    return this.adminFineTuneService.previewFineTuneLoraKey(query.triggerWord);
  }

  @Post('finetunes')
  @ApiOperation({
    summary: 'Create a model-aware LoRA fine-tune job',
    description:
      'Stores the dataset metadata, validates model-family compatibility, generates or validates a unique LoRA key, and queues the matching RunPod trainer worker. Requests without modelFamily remain SDXL.',
  })
  async createFineTune(@Body() dto: CreateAIFinetuneDto) {
    return this.adminFineTuneService.createFineTune(dto);
  }

  @Get('finetunes/:id/status')
  @ApiOperation({ summary: 'Refresh and return a fine-tune training status' })
  async getFineTuneStatus(@Param('id', ParseIntPipe) id: number) {
    return this.adminFineTuneService.getFineTuneStatus(id);
  }
}
