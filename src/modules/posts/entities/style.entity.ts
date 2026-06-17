import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export interface StyleModelOverride {
  positive?: string;
  negative?: string;
  keywords?: string[];
}

/** Per-`aiService` overrides, e.g. { sdxl: { keywords: [...] }, flux2_klein: { positive: '...' } }. */
export type StyleModelOverrides = Record<string, StyleModelOverride>;

@Entity('styles')
export class StyleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100, default: 'anime' })
  slug: string;

  @Column()
  imageUrl: string;

  // --- Structured signal consumed by the model-aware PromptComposer ---
  // All nullable: a style with only `name` set degrades to using its name as
  // the style fragment, so existing rows keep working without migration data.

  /** Core positive style descriptor woven into every model's prompt. */
  @Column({ type: 'text', nullable: true })
  positiveTemplate: string | null;

  /** Style-specific negative prompt (e.g. "photorealistic, 3d render" for a flat anime style). */
  @Column({ type: 'text', nullable: true })
  negativeTemplate: string | null;

  /** Discrete tag tokens for tag/weighted models (SDXL). */
  @Column({ type: 'json', nullable: true })
  keywords: string[] | null;

  /** Optional per-aiService overrides of positive / negative / keywords. */
  @Column({ type: 'json', nullable: true })
  modelOverrides: StyleModelOverrides | null;

  /** Optional per-style CFG hint (clamped to each model's range in the payload builder). */
  @Column({ type: 'float', nullable: true })
  recommendedCfg: number | null;

  /** Optional per-style steps hint (clamped to each model's range in the payload builder). */
  @Column({ type: 'int', nullable: true })
  recommendedSteps: number | null;
}
