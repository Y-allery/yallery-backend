import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { UploadV2Service } from 'src/upload-v2/upload-v2.service';
import * as fal from '@fal-ai/serverless-client';
import axios from 'axios';

@Injectable()
export class FalAudioProvider {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadV2Service: UploadV2Service,
  ) {}

  async generate(params: {
    videoUrl: string;
    prompt: string;
    aiService: string;
    duration: number;
  }): Promise<{ uploadedVideoUrl: string; providerModel: string }> {
    await this.ensureVideoUrlIsReachable(params.videoUrl);

    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: params.aiService, type: 'audio', isActive: true },
    });
    if (!aiSetting?.apiModel) {
      throw new BadRequestException(
        'Invalid AI service selected or apiModel not found',
      );
    }

    const token = await this.serviceTokenService.getNextAvailableToken(
      params.aiService as any,
    );

    fal.config({ credentials: token.token });

    const result = await (fal.run as any)(aiSetting.apiModel, {
      input: {
        video_url: params.videoUrl,
        prompt: params.prompt,
        duration: params.duration,
      },
    });

    const rawVideoUrl = result?.video?.url ?? result?.video?.[0]?.url;
    if (!rawVideoUrl) {
      throw new Error(
        `Audio model returned no video. Result: ${JSON.stringify(result)}`,
      );
    }

    const uploadedVideoUrl = await this.uploadV2Service.uploadVideoUrl(rawVideoUrl);

    return {
      uploadedVideoUrl,
      providerModel: aiSetting.apiModel,
    };
  }

  private async ensureVideoUrlIsReachable(videoUrl: string): Promise<void> {
    try {
      const head = await axios.head(videoUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });

      if (head.status < 200 || head.status >= 400) {
        throw new BadRequestException(
          `videoUrl is not reachable (status ${head.status}). Make sure it's a public direct video URL.`,
        );
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      throw new BadRequestException(
        `videoUrl preflight failed: ${message}. Make sure it's a public direct video URL.`,
      );
    }
  }
}
