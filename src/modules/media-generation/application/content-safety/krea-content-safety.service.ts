import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { AI_SERVICES } from 'src/modules/media-generation/domain/ai-service.catalog';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

type ModerationImageInput = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type ModerationInput = string | ModerationImageInput[];

/** Services whose upstream requires us to moderate before dispatch. */
const MODERATED_AI_SERVICES: ReadonlySet<string> = new Set<string>([
  AI_SERVICES.PHOTO_PRO,
  AI_SERVICES.PORTRAIT,
]);
const MODERATION_URL = 'https://api.openai.com/v1/moderations';
const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';
const MODERATION_TIMEOUT_MS = 15_000;
const BLOCKED_MESSAGE =
  'This image request cannot be completed because it violates the content safety policy.';
const UNAVAILABLE_MESSAGE =
  'Content safety validation is temporarily unavailable.';

@Injectable()
export class KreaContentSafetyService {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async assertPromptAllowed(aiService: string, prompt: string): Promise<void> {
    if (!this.requiresModeration(aiService)) {
      return;
    }

    if (await this.isFlagged(prompt)) {
      throw new BadRequestException(BLOCKED_MESSAGE);
    }
  }

  async assertProviderImagesAllowed(
    aiService: string,
    imageUrls: string[],
  ): Promise<void> {
    if (!this.requiresModeration(aiService) || imageUrls.length === 0) {
      return;
    }

    const input: ModerationImageInput[] = imageUrls.map((url) => ({
      type: 'image_url',
      image_url: { url },
    }));

    if (await this.isFlagged(input)) {
      throw new BadRequestException(BLOCKED_MESSAGE);
    }
  }

  private requiresModeration(aiService: string): boolean {
    return MODERATED_AI_SERVICES.has(aiService);
  }

  private async isFlagged(input: ModerationInput): Promise<boolean> {
    try {
      const [apiKey, configuredModel] = await Promise.all([
        this.providerRuntimeConfigService.getString('OPENAI_API_KEY'),
        this.providerRuntimeConfigService.getString('OPENAI_MODERATION_MODEL'),
      ]);

      if (!apiKey) {
        throw new Error('OpenAI moderation is not configured');
      }

      const response = await axios.post(
        MODERATION_URL,
        {
          model: configuredModel?.trim() || DEFAULT_MODERATION_MODEL,
          input,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: MODERATION_TIMEOUT_MS,
        },
      );

      const results = response.data?.results;
      if (
        !Array.isArray(results) ||
        results.length === 0 ||
        results.some(
          (result: unknown) =>
            !result ||
            typeof result !== 'object' ||
            typeof (result as { flagged?: unknown }).flagged !== 'boolean',
        )
      ) {
        throw new Error('OpenAI moderation returned an invalid response');
      }

      return results.some(
        (result: { flagged: boolean }) => result.flagged === true,
      );
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
