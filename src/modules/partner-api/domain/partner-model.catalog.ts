import { AI_SERVICES } from 'src/modules/media-generation/domain/ai-service.catalog';

/**
 * The models a partner can address, and where each one is actually executed.
 *
 * The video flagship is ours, not the hosted one, and that is not the same trade-off as
 * the images. Measured head to head on the same input (2026-08-05): ours returns
 * 1280x704 at 24 fps with a soundtrack in 39 s and costs us ~$0.065; the hosted model
 * returns 960x960 at 16 fps, silent, in 76 s and costs $0.11. It loses on every axis, so
 * it is kept only as an A/B and as somewhere to fall back to.
 *
 * Text-to-video goes through a still rather than straight to the video model. The worker
 * has no notion of that — it animates when it is handed an image and generates from
 * nothing when it is not — so the two steps are ours to sequence. It is worth doing: a
 * clip generated from nothing drifts, and one generated from a picture we have already
 * seen does not. The app reached the same conclusion and runs a heavier version of it.
 *
 * The public id is a product name. Which engine runs it, and on whose hardware, is not
 * published anywhere in the request, the response or the errors — that is the point of
 * this indirection, and it is what lets `backend` move without the partner noticing.
 *
 * Moving a model between backends is a deliberate lever, not a detail. Our own workers
 * are billed for the whole window they are held warm, so their unit cost falls with
 * volume, while the hosted backend charges a flat per-image price. The crossover sits
 * near 1.3k/day for edits and 2.7k/day for text-to-image (measured 2026-08-05), so a
 * partner starting small is cheaper on the hosted side and cheaper on ours once they
 * grow.
 */
export type PartnerBackend = 'hosted' | 'inhouse';

export type PartnerCapability =
  | 'text_to_image'
  | 'image_to_image'
  | 'image_to_video'
  | 'text_to_video';

export interface PartnerModel {
  /** Published id. Never leaks the engine. */
  id: string;
  capability: PartnerCapability;
  description: string;
  backend: PartnerBackend;
  /** Hosted: the upstream model name. In-house: our canonical aiService. */
  target: string;
  /** What the partner is charged, in USD per output. */
  priceUsd: number;
  /** What it costs us at the volume this backend is chosen for. Never published. */
  costUsd: number;
  /** Sizes accepted for this model, first is the default. */
  sizes: readonly string[];
}

export const PARTNER_MODELS: readonly PartnerModel[] = [
  {
    id: 'yengine-photo',
    capability: 'text_to_image',
    description: 'Photoreal text-to-image. Fastest option.',
    backend: 'hosted',
    target: 'p-image',
    priceUsd: 0.015,
    costUsd: 0.005,
    sizes: ['1024x1024', '1280x704', '704x1280'],
  },
  {
    id: 'yengine-photo-alt',
    capability: 'text_to_image',
    description:
      'Text-to-image with a different aesthetic. Useful as an A/B against yengine-photo.',
    backend: 'inhouse',
    target: AI_SERVICES.PHOTO,
    priceUsd: 0.015,
    costUsd: 0.0027,
    sizes: ['1024x1024', '1280x704', '704x1280'],
  },
  {
    id: 'yengine-edit',
    capability: 'image_to_image',
    description:
      'Instruction-driven photo editing from 1-3 reference images. Fastest option.',
    backend: 'hosted',
    target: 'p-image-edit',
    priceUsd: 0.025,
    costUsd: 0.01,
    sizes: ['match_input_image', '1024x1024', '1280x704', '704x1280'],
  },
  {
    id: 'yengine-edit-alt',
    capability: 'image_to_image',
    description:
      'Photo editing with a different model. Useful as an A/B against yengine-edit.',
    // Ran on our own worker until 2026-08-12. The model is unchanged — the same one is
    // hosted upstream — but ours had to fetch 30 GB of weights onto every fresh worker
    // before it could start: 224 s and 356 s measured, against 7 s of actual work, and
    // partners were timing out rather than waiting. Hosted answers in 6.9 s (median of
    // three) for half a cent. Our own hardware wins on unit cost once a worker stays
    // warm, so this moves back the moment the volume justifies it. The app still edits
    // through the worker, which is why it stays running.
    backend: 'hosted',
    target: 'qwen-image-edit-plus',
    priceUsd: 0.025,
    costUsd: 0.005,
    sizes: ['match_input_image', '1024x1024', '1280x704', '704x1280'],
  },
  {
    id: 'yengine-video-hd',
    capability: 'image_to_video',
    description:
      'Image-to-video, 1280x704 at 24 fps with a generated soundtrack.',
    backend: 'inhouse',
    target: AI_SERVICES.VIDEO_IMAGE,
    priceUsd: 0.18,
    costUsd: 0.065,
    sizes: ['720p'],
  },
  {
    id: 'yengine-video-fhd',
    capability: 'image_to_video',
    description:
      'Image-to-video, 1920x1088 at 24 fps with a generated soundtrack. Same worker as ' +
      'yengine-video-hd at twice the pixels: ~55s of generation instead of ~26s.',
    backend: 'inhouse',
    target: AI_SERVICES.VIDEO_IMAGE,
    priceUsd: 0.28,
    costUsd: 0.1,
    sizes: ['1080p'],
  },
  {
    id: 'yengine-video-text-fhd',
    capability: 'text_to_video',
    description:
      'Text-to-video, 1920x1088 at 24 fps with a generated soundtrack. Slowest model — pass callback_url.',
    backend: 'inhouse',
    target: AI_SERVICES.VIDEO_IMAGE,
    priceUsd: 0.28,
    // The still is the same rounding error as on the 720p tier; the clip is what costs.
    costUsd: 0.105,
    sizes: ['1080p'],
  },
  {
    id: 'yengine-video-text',
    capability: 'text_to_video',
    description:
      'Text-to-video, 1280x704 at 24 fps with a generated soundtrack. Slowest model — pass callback_url.',
    backend: 'inhouse',
    target: AI_SERVICES.VIDEO_IMAGE,
    priceUsd: 0.18,
    // Still plus clip. The still is a rounding error next to the video, which is why
    // going through one buys a lot for almost nothing.
    costUsd: 0.07,
    sizes: ['720p'],
  },
];

export function findPartnerModel(id: string): PartnerModel | null {
  const wanted = (id ?? '').trim();
  return PARTNER_MODELS.find((model) => model.id === wanted) ?? null;
}

export function partnerModelsFor(
  capability: PartnerCapability,
): readonly PartnerModel[] {
  return PARTNER_MODELS.filter((model) => model.capability === capability);
}

/** Public view: price and capability, never the backend or our cost. */
export function describePartnerModel(model: PartnerModel) {
  return {
    id: model.id,
    capability: model.capability,
    description: model.description,
    price_usd: model.priceUsd,
    sizes: [...model.sizes],
  };
}
