import {
  AI_SERVICES,
  LEGACY_AI_SERVICE_IDS,
  isCanonicalAiService,
  normalizeAiService,
} from 'src/modules/media-generation/domain/ai-service.catalog';
import { RUNPOD_MEDIA_ROUTE_CATALOG } from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';

describe('ai-service catalog', () => {
  it('maps every retired id onto a canonical one', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_AI_SERVICE_IDS)) {
      expect(isCanonicalAiService(canonical)).toBe(true);
      expect(normalizeAiService(legacy)).toBe(canonical);
    }
  });

  // App builds already shipped send the retired ids; losing this breaks generation for
  // everyone who has not updated.
  it('accepts a retired id and returns the canonical one', () => {
    expect(normalizeAiService('yengine_photo')).toBe(AI_SERVICES.PHOTO);
    expect(normalizeAiService('yengine_edit')).toBe(AI_SERVICES.EDIT);
    expect(normalizeAiService('yengine_video_image')).toBe(
      AI_SERVICES.VIDEO_IMAGE,
    );
  });

  it('passes a canonical id through untouched and trims stray whitespace', () => {
    expect(normalizeAiService(AI_SERVICES.PHOTO)).toBe(AI_SERVICES.PHOTO);
    expect(normalizeAiService('  yengine_edit  ')).toBe(AI_SERVICES.EDIT);
  });

  // The lookups that consume it name the unknown value in their error; swallowing it
  // here would turn a clear failure into a confusing one.
  it('returns an unknown value unchanged rather than guessing', () => {
    expect(normalizeAiService('not_a_service')).toBe('not_a_service');
    expect(normalizeAiService(null)).toBeNull();
    expect(normalizeAiService(undefined)).toBeUndefined();
  });

  it('never resolves a retired id to another retired id', () => {
    for (const canonical of Object.values(LEGACY_AI_SERVICE_IDS)) {
      expect(LEGACY_AI_SERVICE_IDS[canonical]).toBeUndefined();
    }
  });

  // A route keyed on a retired id would be unreachable once the boundary normalises.
  it('keys every route on a canonical id', () => {
    for (const route of RUNPOD_MEDIA_ROUTE_CATALOG) {
      expect({
        aiService: route.aiService,
        canonical: isCanonicalAiService(route.aiService),
      }).toEqual({ aiService: route.aiService, canonical: true });
    }
  });

  it('publishes no vendor-shaped id', () => {
    const vendor =
      /krea|qwen|sdxl|flux|z_image|mmaudio|wan22|p_video|ltx|pruna/i;
    for (const id of Object.values(AI_SERVICES)) {
      expect({ id, leaks: vendor.test(id) }).toEqual({ id, leaks: false });
    }
  });
});
