import { BadRequestException } from '@nestjs/common';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';

describe('MediaGenerationPricingService', () => {
  const createService = (findOne: jest.Mock) => {
    return new MediaGenerationPricingService({
      findOne,
    } as any);
  };

  it('calculates fixed and per-second video costs', () => {
    const service = createService(jest.fn());

    expect(
      service.resolveVideoGenerationCost({
        cost: 42,
        settings: {
          durations: [5, 10],
          pricing: { strategy: 'fixed' },
        },
      } as any),
    ).toBe(42);

    expect(
      service.resolveVideoGenerationCost({
        cost: 42,
        settings: {
          durations: [5, 10],
          pricing: { strategy: 'per_second', creditsPerSecond: 3.2 },
        },
      } as any),
    ).toBe(16);
  });

  it('calculates meme per-second cost from source duration', async () => {
    const service = createService(
      jest.fn().mockResolvedValue({
        cost: 20,
        settings: {
          pricing: { strategy: 'per_second', creditsPerSecond: 2.5 },
        },
      }),
    );

    await expect(
      service.getMemeCost('wan22_animate_native', 4.1),
    ).resolves.toBe(13);
  });

  it('throws when active settings are missing', async () => {
    const service = createService(jest.fn().mockResolvedValue(null));

    await expect(service.getAudioCost('missing')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validates prompt image quantity from model settings', async () => {
    const service = createService(
      jest.fn().mockResolvedValue({
        settings: {
          minImages: 1,
          maxImages: 5,
        },
      }),
    );

    await expect(
      service.assertPromptImageQuantity('krea2_turbo', 5),
    ).resolves.toBeUndefined();
    await expect(
      service.assertPromptImageQuantity('krea2_turbo', 6),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('assertImageEditReferenceCount', () => {
    it('defaults to a single reference when the row has not opted in', async () => {
      // An un-migrated row must behave exactly as before the multi-reference release.
      const service = createService(
        jest.fn().mockResolvedValue({ settings: {} }),
      );

      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 1),
      ).resolves.toBeUndefined();
      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 2),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows up to the configured maximum', async () => {
      const service = createService(
        jest.fn().mockResolvedValue({
          settings: { minReferenceImages: 1, maxReferenceImages: 3 },
        }),
      );

      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 3),
      ).resolves.toBeUndefined();
      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 4),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never exceeds the worker ceiling even if the row asks for more', async () => {
      // Guards against an admin typo asking the worker for more references than it supports.
      const service = createService(
        jest.fn().mockResolvedValue({
          settings: { minReferenceImages: 1, maxReferenceImages: 99 },
        }),
      );

      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 3),
      ).resolves.toBeUndefined();
      await expect(
        service.assertImageEditReferenceCount('qwen_image_edit_baked', 4),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the edit model has no active settings row', async () => {
      const service = createService(jest.fn().mockResolvedValue(null));

      await expect(
        service.assertImageEditReferenceCount('missing_service', 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('prices an edit flat regardless of how many references it carries', async () => {
    const service = createService(
      jest.fn().mockResolvedValue({ cost: 80, settings: {} }),
    );

    await expect(
      service.getImageEditCost('qwen_image_edit_baked', 1),
    ).resolves.toBe(80);
    await expect(
      service.getImageEditCost('qwen_image_edit_baked', 3),
    ).resolves.toBe(80);
  });
});
