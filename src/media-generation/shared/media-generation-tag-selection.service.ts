import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { TagEntity } from 'src/tag/entities/tag.entity';

@Injectable()
export class MediaGenerationTagSelectionService {
  private readonly logger = new Logger(MediaGenerationTagSelectionService.name);
  private readonly openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
  ) {}

  async selectBestTag(prompt: string): Promise<TagEntity | null> {
    const tags = await this.tagRepository.find();
    if (tags.length === 0) {
      return null;
    }

    if (!this.openai) {
      this.logger.warn(
        'OPENAI_API_KEY is not configured, falling back to the first available tag for autoSelectTag',
      );
      return tags[0];
    }

    const tagDescriptions = tags
      .map((tag) => `ID: ${tag.id}, Name: ${tag.name}`)
      .join('\n');

    const chatPrompt = `
Based on the following tags:
${tagDescriptions}

And the prompt: "${prompt}",

Please select the most appropriate single tag for the primary subject of the image.
Return the response in JSON format:
{
  "tag_id": <ID of the most suitable tag>
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: chatPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        return tags[0];
      }

      const parsed = JSON.parse(content);
      const tagId = Number(parsed?.tag_id);
      const bestTag = tags.find((tag) => tag.id === tagId);

      return bestTag || tags[0];
    } catch (error) {
      this.logger.warn(
        `Auto tag selection failed, falling back to the first available tag: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return tags[0];
    }
  }
}
