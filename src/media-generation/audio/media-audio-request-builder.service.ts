import { Injectable } from '@nestjs/common';
import { GenerateMediaAudioDto } from './dto/generate-media-audio.dto';
import { MediaAudioGenerationRequest } from './types/media-audio-request.types';

@Injectable()
export class MediaAudioRequestBuilderService {
  build(dto: GenerateMediaAudioDto): MediaAudioGenerationRequest {
    return {
      videoUrl: dto.videoUrl,
      prompt: dto.prompt,
      aiService: dto.aiService,
      duration: dto.duration ?? 8,
      contestId: dto.contestId ?? null,
    };
  }
}
