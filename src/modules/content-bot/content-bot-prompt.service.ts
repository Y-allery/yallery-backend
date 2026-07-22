import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { ContentBotMediaKind } from './entities/content-bot-plan.entity';

export interface PromptBrief {
  tag: string;
  mediaKind: ContentBotMediaKind;
  styleHint?: string;
}

/**
 * Writes fresh generation prompts with an LLM (OpenAI), one batched call per
 * plan. SFW is enforced by (1) this instruction, (2) OpenAI's own policy which
 * won't author NSFW, and (3) the image/video models' built-in NSFW protection —
 * so there is no keyword filter blocking generations. The one axis the model's
 * NSFW guard does NOT cover — real-person/celebrity likeness — is handled by an
 * explicit instruction here.
 *
 * Returns one entry per brief, in order; a null entry means "no AI prompt, use
 * the static fallback", so a missing key or an API error never stalls the bot.
 */
@Injectable()
export class ContentBotPromptService {
  private readonly logger = new Logger(ContentBotPromptService.name);
  private static readonly DEFAULT_MODEL = 'gpt-4o-mini';

  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async generate(briefs: PromptBrief[]): Promise<Array<string | null>> {
    if (briefs.length === 0) return [];
    try {
      return await this.generateOrThrow(briefs);
    } catch (error) {
      // Covers OpenAI API errors AND a broken/undecryptable OPENAI_API_KEY row
      // (ProviderRuntimeConfigService throws rather than returning null on a
      // decrypt failure) — either way, degrade to the static bank, don't 500.
      this.logger.warn(
        `prompt generation failed, falling back to static bank: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return briefs.map(() => null);
    }
  }

  private async generateOrThrow(
    briefs: PromptBrief[],
  ): Promise<Array<string | null>> {
    const openai = await this.createClient();
    if (!openai) {
      this.logger.warn('OPENAI_API_KEY not set — using static prompt fallback');
      return briefs.map(() => null);
    }

    const model =
      (await this.providerRuntimeConfigService.getString(
        'CONTENT_BOT_OPENAI_MODEL',
      )) || ContentBotPromptService.DEFAULT_MODEL;

    const response = await openai.chat.completions.create({
      model,
      temperature: 0.95,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.systemPrompt(briefs.length) },
        { role: 'user', content: this.userPrompt(briefs) },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return briefs.map(() => null);

    const parsed = JSON.parse(raw) as { prompts?: unknown };
    const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
    return briefs.map((_, i) => {
      const value = prompts[i];
      return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null;
    });
  }

  private systemPrompt(count: number): string {
    return `You are a senior creative director writing prompts for an AI image/video generator on a social art platform. Write vivid, specific, visually rich prompts (about 30-60 words each) that will produce eye-catching, "wow" results people want to recreate.

STRICT RULES:
- Strictly SFW. Tasteful, classy, editorial quality.
- Adults only. Never depict minors.
- No real, named, or recognizable people. No celebrities, no public figures, no likeness of real individuals. No brand names, logos or trademarks.
- For "girl", "beauty" and "fashion" themes: elegant glamour / fashion-editorial / portrait imagery at fashion-magazine level, and vary between Western editorial and East-Asian / K-beauty aesthetics.
- For video items: describe motion and cinematic camera movement.
- Every prompt must be distinct from the others.

Return STRICT JSON only: {"prompts": ["...", "..."]} with EXACTLY ${count} strings, in the same order as the input items, one prompt per item.`;
  }

  private userPrompt(briefs: PromptBrief[]): string {
    const items = briefs.map((b, i) => ({
      index: i,
      theme: b.tag,
      type: b.mediaKind,
      style: b.styleHint ?? undefined,
    }));
    return `Write one prompt for each of these ${briefs.length} items (keep the order):\n${JSON.stringify(
      items,
    )}`;
  }

  private async createClient(): Promise<OpenAI | null> {
    const apiKey =
      await this.providerRuntimeConfigService.getString('OPENAI_API_KEY');
    return apiKey ? new OpenAI({ apiKey }) : null;
  }
}
