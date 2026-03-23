import { ContestEntity } from 'src/contest/entity/contest.entity';
import { ColorEntity } from 'src/image-generation/entities/color.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';

export interface ResolveMediaGenerationContextParams {
  context?: string;
  prompt?: string;
  autoSelectTag?: boolean;
  tagId?: number;
  styleId?: number;
  colorId?: number;
  contestId?: number;
}

export interface MediaGenerationContext {
  context?: string;
  tag: TagEntity | null;
  style: StyleEntity | null;
  color: ColorEntity | null;
  contest: ContestEntity | null;
  primaryTag: TagEntity | null;
}
