import { Injectable } from '@nestjs/common';
import { GenerateMediaVideoDto } from './dto/generate-media-video.dto';
import { MediaVideoGenerationRequest } from './types/media-video-request.types';

@Injectable()
export class MediaVideoRequestBuilderService {
  build(dto: GenerateMediaVideoDto): MediaVideoGenerationRequest {
    return {
      imageUrl: dto.imageUrl ?? null,
      prompt: dto.prompt,
      aiService: dto.aiService,
      duration: dto.duration ?? 5,
      contestId: dto.contestId ?? null,
    };
  }
}
