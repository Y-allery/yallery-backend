import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { ColorEntity } from 'src/image-generation/entities/color.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import {
  MediaGenerationContext,
  ResolveMediaGenerationContextParams,
} from './media-generation-context.types';

@Injectable()
export class MediaGenerationContextService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async resolve(
    params: ResolveMediaGenerationContextParams,
  ): Promise<MediaGenerationContext> {
    const [tag, style, color, contest] = await Promise.all([
      params.tagId
        ? this.tagRepository.findOne({
            where: { id: params.tagId },
          })
        : null,
      params.styleId
        ? this.styleRepository.findOne({
            where: { id: params.styleId },
          })
        : null,
      params.colorId
        ? this.colorRepository.findOne({
            where: { id: params.colorId },
          })
        : null,
      params.contestId
        ? this.contestRepository.findOne({
            where: { id: params.contestId },
            relations: { tag: true },
          })
        : null,
    ]);

    if (params.tagId && !tag) {
      throw new BadRequestException('Tag not found');
    }

    if (params.styleId && !style) {
      throw new BadRequestException('Style not found');
    }

    if (params.colorId && !color) {
      throw new BadRequestException('Color not found');
    }

    if (params.contestId && !contest) {
      throw new BadRequestException('Contest not found');
    }

    return {
      context: params.context?.trim() || undefined,
      tag,
      style,
      color,
      contest,
      primaryTag: tag ?? contest?.tag ?? null,
    };
  }
}
