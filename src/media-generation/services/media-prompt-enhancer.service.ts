import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as leoProfanity from 'leo-profanity';
import OpenAI from 'openai';
import { StyleEntity } from 'src/post/entities/style.entity';
import { Repository } from 'typeorm';
import { ColorEntity } from '../entities/color.entity';

type MediaPromptEnhancementMode = 'image_generate' | 'image_edit';

interface MediaPromptEnhancementInput {
  prompt: string;
  styleId?: number | null;
  colorId?: number | null;
  mode: MediaPromptEnhancementMode;
}

interface MediaPromptEnhancementResult {
  translatedPrompt: string;
  enhancedPrompt: string;
  style: StyleEntity | null;
  color: ColorEntity | null;
}

@Injectable()
export class MediaPromptEnhancerService {
  private readonly logger = new Logger(MediaPromptEnhancerService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
  ) {
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  async enhancePrompt(
    input: MediaPromptEnhancementInput,
  ): Promise<MediaPromptEnhancementResult> {
    const prompt = input.prompt?.trim();

    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }

    const [style, color] = await Promise.all([
      input.styleId
        ? this.styleRepository.findOne({
            where: { id: input.styleId },
            select: { id: true, name: true, slug: true, imageUrl: true },
          })
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

    if (!this.openai) {
      return {
        translatedPrompt,
        enhancedPrompt: this.buildFallbackPrompt(
          translatedPrompt,
          style,
          color,
          input.mode,
        ),
        style,
        color,
      };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `You are an expert AI image prompt engineer.

Your job:
1. Detect the prompt language and translate it into natural, fluent English.
2. Preserve the user's exact intent and subject.
3. Strongly improve the prompt for high-quality AI image generation.
4. If a style or color direction is provided, integrate it naturally and explicitly.
5. Do not add unrelated subjects or story elements.
6. For image_edit mode, write instructions for editing an existing image while preserving the main subject's identity, pose, and framing unless the user explicitly asks to change them.

Return strict JSON only in this format:
{"translated_prompt":"...","enhanced_prompt":"..."}`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              mode: input.mode,
              prompt: translatedPrompt,
              style: style?.name ?? null,
              color: color?.name ?? null,
            }),
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content?.trim();
      const parsedContent = this.parseJsonResponse(rawContent);
      const aiTranslatedPrompt = parsedContent?.translated_prompt?.trim();
      const enhancedPrompt = parsedContent?.enhanced_prompt?.trim();

      if (!aiTranslatedPrompt || !enhancedPrompt) {
        throw new Error('OpenAI did not return translated_prompt and enhanced_prompt');
      }

      return {
        translatedPrompt: aiTranslatedPrompt,
        enhancedPrompt,
        style,
        color,
      };
    } catch (error: any) {
      this.logger.warn(
        `Falling back to local prompt enhancement for "${prompt.substring(0, 80)}": ${error?.message || error}`,
      );

      return {
        translatedPrompt,
        enhancedPrompt: this.buildFallbackPrompt(
          translatedPrompt,
          style,
          color,
          input.mode,
        ),
        style,
        color,
      };
    }
  }

  private sanitizePrompt(prompt: string): string {
    if (leoProfanity.check(prompt)) {
      return 'Create a neutral and appropriate image.';
    }

    return prompt;
  }

  private buildFallbackPrompt(
    prompt: string,
    style: StyleEntity | null,
    color: ColorEntity | null,
    mode: MediaPromptEnhancementMode,
  ): string {
    const styleInstruction = style
      ? ` with a clear ${style.name} visual language`
      : '';
    const colorInstruction = color
      ? ` using ${this.describeColorPalette(color.name)}`
      : '';

    if (mode === 'image_edit') {
      return `Edit the provided image so that it clearly reflects this request: ${prompt}. Keep the main subject recognizable and preserve the original composition unless the request explicitly changes it. The final image should feel polished and coherent${styleInstruction}${colorInstruction}, with natural detail, believable lighting, and clean integration of all requested changes.`;
    }

    return `Create a visually striking, highly detailed image of ${prompt}. Use strong composition, polished professional rendering, rich detail, and expressive lighting${styleInstruction}${colorInstruction}. Make the scene feel intentional, visually cohesive, and premium.`;
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

  private describeColorPalette(colorName: string): string {
    const normalizedColor = colorName.trim().toLowerCase();

    switch (normalizedColor) {
      case 'nature':
        return 'a nature-inspired palette with organic greens, earthy tones, and natural atmospheric color harmony';
      case 'bright':
        return 'a bright, vivid palette with vibrant high-energy colors';
      case 'bw':
        return 'a black-and-white monochrome palette with rich contrast';
      default:
        return `a ${colorName} color palette`;
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
