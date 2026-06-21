import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as leoProfanity from 'leo-profanity';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { Repository } from 'typeorm';
import { ColorEntity } from 'src/modules/media-generation/persistence/entities/color.entity';
import { MediaStyleDescriptor } from 'src/modules/media-generation/domain/contracts/media-style-descriptor.contract';

interface MediaPromptContextInput {
  prompt: string;
  styleId?: number | null;
  colorId?: number | null;
}

export interface MediaPromptContextResult {
  /** Raw user prompt (profanity-guarded). NOT upsampled — the worker's own upsampler does that. */
  prompt: string;
  style: StyleEntity | null;
  color: ColorEntity | null;
  styleDescriptor: MediaStyleDescriptor | null;
}

/**
 * Thin prompt-context resolver.
 *
 * Prompt UPSAMPLING / model-specific shaping now lives INSIDE each RunPod worker (always on,
 * per model). The backend no longer calls an LLM, translates, or composes per-model prompts.
 * It only: (1) profanity-guards the raw prompt, and (2) looks up the chosen style/color from the
 * DB and hands the worker a structured descriptor, so the worker's upsampler applies the style.
 */
@Injectable()
export class MediaPromptEnhancerService {
  constructor(
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
  ) {}

  async resolveContext(
    input: MediaPromptContextInput,
  ): Promise<MediaPromptContextResult> {
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

    const safePrompt = leoProfanity.check(prompt)
      ? 'a neutral and appropriate image'
      : prompt;

    let styleDescriptor: MediaStyleDescriptor | null = null;
    if (style || color?.name) {
      const positive = [
        style?.positiveTemplate || null,
        color?.name ? `color palette: ${color.name}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      styleDescriptor = {
        name: style?.name ?? null,
        positive: positive || null,
        negative: style?.negativeTemplate ?? null,
        keywords: (style?.keywords as string[] | null) ?? null,
      };
    }

    return { prompt: safePrompt, style, color, styleDescriptor };
  }
}
