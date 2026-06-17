import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as leoProfanity from 'leo-profanity';
import OpenAI from 'openai';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { Repository } from 'typeorm';
import { ColorEntity } from 'src/modules/media-generation/persistence/entities/color.entity';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { PromptComposerService } from 'src/modules/media-generation/application/prompt-enhancement/prompt-composer.service';

type MediaPromptEnhancementMode = 'image_generate' | 'image_edit';

interface MediaPromptEnhancementInput {
  prompt: string;
  styleId?: number | null;
  colorId?: number | null;
  mode: MediaPromptEnhancementMode;
  /** Target model — lets the composer format the prompt the way that model wants. */
  aiService?: string | null;
}

interface MediaPromptEnhancementResult {
  translatedPrompt: string;
  enhancedPrompt: string;
  negativePrompt: string | null;
  cfg: number | null;
  steps: number | null;
  style: StyleEntity | null;
  color: ColorEntity | null;
}

@Injectable()
export class MediaPromptEnhancerService {
  private readonly logger = new Logger(MediaPromptEnhancerService.name);

  constructor(
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly promptComposerService: PromptComposerService,
  ) {}

  async enhancePrompt(
    input: MediaPromptEnhancementInput,
  ): Promise<MediaPromptEnhancementResult> {
    const prompt = input.prompt?.trim();

    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }

    const [style, color] = await Promise.all([
      input.styleId
        ? this.styleRepository.findOne({ where: { id: input.styleId } })
        : null,
      input.colorId
        ? this.colorRepository.findOne({
            where: { id: input.colorId },
            select: { id: true, name: true },
          })
        : null,
    ]);

    if (input.styleId && !style) {
      throw new BadRequestException('Style not found');
    }

    if (input.colorId && !color) {
      throw new BadRequestException('Color not found');
    }

    const sanitizedPrompt = this.sanitizePrompt(prompt);
    const translatedPrompt = await this.translatePromptToEnglish(sanitizedPrompt);

    // The LLM (or fallback) produces a clean, STYLE-NEUTRAL subject description.
    // Style, color and negatives are applied deterministically by the composer
    // so the chosen style always reaches the model in the right format.
    const { translated, baseDescription } = await this.buildBaseDescription(
      translatedPrompt,
      input.mode,
    );

    const composed = this.promptComposerService.compose({
      aiService: input.aiService ?? null,
      baseDescription,
      style,
      color,
      mode: input.mode,
    });

    return {
      translatedPrompt: translated,
      enhancedPrompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      cfg: composed.cfg,
      steps: composed.steps,
      style,
      color,
    };
  }

  private async buildBaseDescription(
    translatedPrompt: string,
    mode: MediaPromptEnhancementMode,
  ): Promise<{ translated: string; baseDescription: string }> {
    const openai = await this.createOpenAIClient();

    if (!openai) {
      return {
        translated: translatedPrompt,
        baseDescription: this.buildFallbackBaseDescription(
          translatedPrompt,
          mode,
        ),
      };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert AI image prompt engineer.

Your job:
1. Detect the prompt language and translate it into natural, fluent English.
2. Preserve the user's exact intent and subject.
3. Strongly improve the prompt for high-quality AI image generation (composition, detail, lighting, framing).
4. Do NOT add style directions, art movements, mediums, or color palettes — those are applied separately downstream.
5. Do not add unrelated subjects or story elements.
6. For image_edit mode, write instructions for editing an existing image while preserving the main subject's identity, pose, and framing unless the user explicitly asks to change them.

Return strict JSON only in this format:
{"translated_prompt":"...","enhanced_prompt":"..."}`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              mode,
              prompt: translatedPrompt,
            }),
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content?.trim();
      const parsedContent = this.parseJsonResponse(rawContent);
      const aiTranslatedPrompt = parsedContent?.translated_prompt?.trim();
      const enhancedPrompt = parsedContent?.enhanced_prompt?.trim();

      if (!aiTranslatedPrompt || !enhancedPrompt) {
        throw new Error(
          'OpenAI did not return translated_prompt and enhanced_prompt',
        );
      }

      return { translated: aiTranslatedPrompt, baseDescription: enhancedPrompt };
    } catch (error: any) {
      this.logger.warn(
        `Falling back to local prompt enhancement for "${translatedPrompt.substring(0, 80)}": ${error?.message || error}`,
      );

      return {
        translated: translatedPrompt,
        baseDescription: this.buildFallbackBaseDescription(
          translatedPrompt,
          mode,
        ),
      };
    }
  }

  private async createOpenAIClient(): Promise<OpenAI | null> {
    const apiKey = await this.providerRuntimeConfigService.getString(
      'OPENAI_API_KEY',
    );

    return apiKey ? new OpenAI({ apiKey }) : null;
  }

  private sanitizePrompt(prompt: string): string {
    if (leoProfanity.check(prompt)) {
      return 'Create a neutral and appropriate image.';
    }

    return prompt;
  }

  /** Style-neutral subject description; the composer adds style/color/negatives. */
  private buildFallbackBaseDescription(
    prompt: string,
    mode: MediaPromptEnhancementMode,
  ): string {
    if (mode === 'image_edit') {
      return `Edit the provided image so that it clearly reflects this request: ${prompt}. Keep the main subject recognizable and preserve the original composition unless the request explicitly changes it. The final image should feel polished and coherent, with natural detail, believable lighting, and clean integration of all requested changes.`;
    }

    return `Create a visually striking, highly detailed image of ${prompt}. Use strong composition, polished professional rendering, rich detail, and expressive lighting. Make the scene feel intentional, visually cohesive, and premium.`;
  }

  private async translatePromptToEnglish(prompt: string): Promise<string> {
    try {
      const response = await axios.get(
        'https://translate.googleapis.com/translate_a/single',
        {
          params: {
            client: 'gtx',
            sl: 'auto',
            tl: 'en',
            dt: 't',
            q: prompt,
          },
          timeout: 5000,
        },
      );

      const translatedSegments = Array.isArray(response.data?.[0])
        ? response.data[0]
            .map((segment: any) =>
              Array.isArray(segment) ? String(segment[0] ?? '') : '',
            )
            .join('')
            .trim()
        : '';

      return translatedSegments || prompt;
    } catch (error: any) {
      this.logger.warn(
        `Falling back to original-language prompt for "${prompt.substring(0, 80)}": ${error?.message || error}`,
      );
      return prompt;
    }
  }

  private parseJsonResponse(rawContent?: string | null): {
    translated_prompt?: string;
    enhanced_prompt?: string;
  } | null {
    if (!rawContent) {
      return null;
    }

    const normalizedContent = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return JSON.parse(normalizedContent);
  }
}
