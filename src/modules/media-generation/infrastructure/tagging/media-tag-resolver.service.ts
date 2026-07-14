import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { Repository } from 'typeorm';

@Injectable()
export class MediaTagResolverService {
  private readonly logger = new Logger(MediaTagResolverService.name);

  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async resolveTagForPrompt(
    prompt: string,
    contestId?: number | null,
  ): Promise<TagEntity | null> {
    if (contestId) {
      return null;
    }

    const { otherTag, candidateTags } = await this.getCandidateTags();

    if (!otherTag) {
      return null;
    }

    const normalizedPrompt = prompt?.trim();
    if (!normalizedPrompt) {
      return otherTag;
    }

    const keywordMatch = this.findKeywordTagMatch(normalizedPrompt, candidateTags);
    if (keywordMatch) {
      return keywordMatch;
    }

    const openai = await this.createOpenAIClient();

    if (!openai || candidateTags.length === 0) {
      return otherTag;
    }

    try {
      const bestTag = await this.findBestTagWithAI(
        normalizedPrompt,
        candidateTags,
        openai,
      );
      return bestTag ?? otherTag;
    } catch (error: any) {
      this.logger.warn(
        `Falling back to "other" tag for prompt "${normalizedPrompt.substring(0, 80)}": ${error?.message || error}`,
      );
      return otherTag;
    }
  }

  private async getCandidateTags(): Promise<{
    otherTag: TagEntity | null;
    candidateTags: TagEntity[];
  }> {
    const tags = await this.tagRepository.find({
      select: {
        id: true,
        name: true,
        imageUrl: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const otherTag =
      tags.find((tag) => tag.name.trim().toLowerCase() === 'other') ?? null;

    const candidateTags = tags.filter(
      (tag) => tag.id !== otherTag?.id,
    );

    return {
      otherTag,
      candidateTags,
    };
  }

  private findKeywordTagMatch(prompt: string, tags: TagEntity[]): TagEntity | null {
    const normalizedPrompt = this.normalizeText(prompt);

    const sortedTags = [...tags].sort(
      (left, right) => right.name.trim().length - left.name.trim().length,
    );

    for (const tag of sortedTags) {
      const normalizedTag = this.normalizeText(tag.name);
      if (!normalizedTag) {
        continue;
      }

      if (normalizedPrompt.includes(normalizedTag)) {
        return tag;
      }
    }

    return null;
  }

  private async findBestTagWithAI(
    prompt: string,
    tags: TagEntity[],
    openai: OpenAI,
  ): Promise<TagEntity | null> {
    const tagDescriptions = tags
      .map((tag) => `ID: ${tag.id}, Name: ${tag.name}`)
      .join('\n');

    const model =
      (await this.providerRuntimeConfigService.getString(
        'OPENAI_TAGGING_MODEL',
      )) || 'gpt-4o-mini';

    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `You classify media prompts into exactly one existing tag.

Available tags:
${tagDescriptions}

Return strict JSON in this format:
{"tag_id": <number|null>}

Rules:
- Choose the single best tag for the primary subject or theme of the prompt.
- Prefer concrete subject tags over vague mood tags when possible.
- If no tag is clearly relevant, return {"tag_id": null}.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content?.trim();
    if (!rawContent) {
      return null;
    }

    const parsedResponse = JSON.parse(rawContent);
    const tagId = Number(parsedResponse?.tag_id);

    if (!Number.isFinite(tagId)) {
      return null;
    }

    return tags.find((tag) => tag.id === tagId) ?? null;
  }

  private async createOpenAIClient(): Promise<OpenAI | null> {
    const apiKey = await this.providerRuntimeConfigService.getString(
      'OPENAI_API_KEY',
    );

    return apiKey ? new OpenAI({ apiKey }) : null;
  }

  private normalizeText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }
}
