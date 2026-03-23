import { Injectable } from '@nestjs/common';
import { MediaGenerationContext } from '../shared/media-generation-context.types';

@Injectable()
export class MediaImagePromptComposerService {
  compose(basePrompt: string, context: MediaGenerationContext): string {
    const prompt = basePrompt.trim();
    if (!prompt) {
      return prompt;
    }

    const sections = [
      context.context ? `Additional context: ${context.context}` : null,
      context.contest?.promptExample?.trim()
        ? `Contest brief: ${context.contest.promptExample.trim()}`
        : null,
      context.primaryTag?.name ? `Tag focus: ${context.primaryTag.name}` : null,
      context.style?.name ? `Style direction: ${context.style.name}` : null,
      context.color?.name ? `Color palette: ${context.color.name}` : null,
    ].filter((value): value is string => !!value);

    if (sections.length === 0) {
      return prompt;
    }

    return `${this.ensureSentence(prompt)} ${sections
      .map((section) => this.ensureSentence(section))
      .join(' ')}`.trim();
  }

  private ensureSentence(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }
}
