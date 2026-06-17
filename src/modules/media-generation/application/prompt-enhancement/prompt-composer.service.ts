import { Injectable } from '@nestjs/common';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { ColorEntity } from 'src/modules/media-generation/persistence/entities/color.entity';

export type PromptComposerMode = 'image_generate' | 'image_edit';

export interface ComposePromptInput {
  /** The final target model (post contest-resolution for the main flows). */
  aiService?: string | null;
  /** Style-neutral subject description produced by the enhancer (LLM or fallback). */
  baseDescription: string;
  style: StyleEntity | null;
  color: ColorEntity | null;
  mode: PromptComposerMode;
}

export interface ComposedPrompt {
  prompt: string;
  /** Style-derived negative fragment (the payload builder merges any per-model baseline). */
  negativePrompt: string | null;
  /** Per-style CFG hint (clamped per-model by the payload builder). */
  cfg: number | null;
  /** Per-style steps hint (clamped per-model by the payload builder). */
  steps: number | null;
}

/**
 * Turns a style-neutral base description + the selected style/color into a
 * model-correct prompt. Each image model wants a different prompt shape:
 *   - flux2_klein: fluent natural language, no negative prompt;
 *   - sdxl: natural language + comma-separated style keywords + a negative;
 *   - qwen_image_edit_baked: an imperative edit instruction + a style directive.
 *
 * The style's positive fragment is concatenated deterministically, so the chosen
 * style always survives verbatim into the model input (the previous flow let the
 * LLM paraphrase a lone style *name* away). A style with no template falls back
 * to its display name, so untemplated styles still get a guaranteed style clause.
 */
@Injectable()
export class PromptComposerService {
  compose(input: ComposePromptInput): ComposedPrompt {
    const positive = this.resolvePositive(input.aiService, input.style);
    const negative = this.resolveNegative(input.aiService, input.style);
    const keywords = this.resolveKeywords(input.aiService, input.style);
    const colorPhrase = this.resolveColorPhrase(input.color);
    const cfg = input.style?.recommendedCfg ?? null;
    const steps = input.style?.recommendedSteps ?? null;

    switch (input.aiService) {
      case 'sdxl':
        return {
          prompt: this.joinTags([
            input.baseDescription,
            ...keywords,
            positive,
            colorPhrase,
          ]),
          negativePrompt: negative,
          cfg,
          steps,
        };

      case 'qwen_image_edit_baked':
        return {
          prompt: this.composeInstruction(
            input.baseDescription,
            positive,
            colorPhrase,
          ),
          negativePrompt: negative,
          cfg,
          steps,
        };

      // flux2_klein and any other natural-language model.
      case 'flux2_klein':
      default:
        return {
          prompt: this.joinNaturalLanguage([
            input.baseDescription,
            positive ? `rendered in ${positive}` : null,
            colorPhrase,
          ]),
          negativePrompt: negative,
          cfg,
          steps,
        };
    }
  }

  private resolvePositive(
    aiService: string | null | undefined,
    style: StyleEntity | null,
  ): string | null {
    if (!style) {
      return null;
    }
    const override = this.modelOverride(aiService, style)?.positive;
    return this.clean(override ?? style.positiveTemplate ?? style.name);
  }

  private resolveNegative(
    aiService: string | null | undefined,
    style: StyleEntity | null,
  ): string | null {
    if (!style) {
      return null;
    }
    const override = this.modelOverride(aiService, style)?.negative;
    return this.clean(override ?? style.negativeTemplate ?? null);
  }

  private resolveKeywords(
    aiService: string | null | undefined,
    style: StyleEntity | null,
  ): string[] {
    if (!style) {
      return [];
    }
    const override = this.modelOverride(aiService, style)?.keywords;
    const keywords = override ?? style.keywords ?? [];
    return keywords.map((k) => this.clean(k)).filter((k): k is string => !!k);
  }

  private modelOverride(
    aiService: string | null | undefined,
    style: StyleEntity | null,
  ) {
    if (!aiService || !style?.modelOverrides) {
      return undefined;
    }
    return style.modelOverrides[aiService];
  }

  private resolveColorPhrase(color: ColorEntity | null): string | null {
    if (!color?.name) {
      return null;
    }

    const normalized = color.name.trim().toLowerCase();
    switch (normalized) {
      case 'nature':
        return 'a nature-inspired palette with organic greens, earthy tones, and natural atmospheric color harmony';
      case 'bright':
        return 'a bright, vivid palette with vibrant high-energy colors';
      case 'bw':
        return 'a black-and-white monochrome palette with rich contrast';
      default:
        return `a ${color.name.trim()} color palette`;
    }
  }

  private composeInstruction(
    baseDescription: string,
    positive: string | null,
    colorPhrase: string | null,
  ): string {
    const sentences = [this.ensureSentence(baseDescription)];
    if (positive) {
      sentences.push(`Render the result in ${positive} style.`);
    }
    if (colorPhrase) {
      sentences.push(`Use ${colorPhrase}.`);
    }
    return sentences.join(' ').trim();
  }

  private joinNaturalLanguage(parts: Array<string | null>): string {
    return parts
      .map((p) => this.clean(p))
      .filter((p): p is string => !!p)
      .join(', ');
  }

  private joinTags(parts: Array<string | null>): string {
    return parts
      .map((p) => this.clean(p))
      .filter((p): p is string => !!p)
      .join(', ');
  }

  private ensureSentence(text: string): string {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      return '';
    }
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }
}
