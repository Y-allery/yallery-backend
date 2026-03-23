import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { UploadV2Service } from 'src/upload-v2/upload-v2.service';
import * as fal from '@fal-ai/serverless-client';
import axios from 'axios';
import { AiServiceToken } from 'src/service-token/entities/service-token.entity';

@Injectable()
export class FalVideoProvider {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadV2Service: UploadV2Service,
  ) {}

  async generate(params: {
    imageUrl?: string | null;
    prompt: string;
    aiService: string;
    duration: number;
  }): Promise<{ uploadedVideoUrl: string; providerModel: string }> {
    if (params.imageUrl) {
      await this.ensureSourceUrlIsReachable(params.imageUrl, 'imageUrl');
    }

    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: params.aiService, type: 'video', isActive: true },
    });
    if (!aiSetting?.apiModel) {
      throw new BadRequestException(
        'Invalid AI service selected or apiModel not found',
      );
    }

    const token = await this.serviceTokenService.getNextAvailableToken(
      params.aiService,
    );

    fal.config({ credentials: token.token });

    let rawVideoUrl: string | null = null;
    try {
      const result = await (fal.run as any)(aiSetting.apiModel, {
        input: {
          prompt: params.prompt,
          duration: params.duration,
          ...(params.imageUrl ? { image_url: params.imageUrl } : {}),
        },
      });

      rawVideoUrl = result?.video?.url ?? result?.video?.[0]?.url ?? null;
      if (!rawVideoUrl) {
        throw new Error(
          `Video model returned no video. Result: ${JSON.stringify(result)}`,
        );
      }
    } catch (error) {
      await this.markTokenAsRateLimitedSilently(token, params.aiService);
      throw error;
    }

    const uploadedVideoUrl = await this.uploadV2Service.uploadVideoUrl(rawVideoUrl);

    return {
      uploadedVideoUrl,
      providerModel: aiSetting.apiModel,
    };
  }

  private async ensureSourceUrlIsReachable(
    sourceUrl: string,
    fieldName: string,
  ): Promise<void> {
    try {
      const head = await axios.head(sourceUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });

      if (head.status < 200 || head.status >= 400) {
        throw new BadRequestException(
          `${fieldName} is not reachable (status ${head.status}). Make sure it's a public direct URL.`,
        );
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      throw new BadRequestException(
        `${fieldName} preflight failed: ${message}. Make sure it's a public direct URL.`,
      );
    }
  }

  private async markTokenAsRateLimitedSilently(
    token: AiServiceToken | null,
    aiService: string,
  ): Promise<void> {
    if (!token) {
      return;
    }

    try {
      await this.serviceTokenService.markTokenAsRateLimited(token, aiService);
    } catch {
      return;
    }
  }
}
