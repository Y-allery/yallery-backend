import { BadRequestException } from '@nestjs/common';
import { MediaGenerationGuardsService } from './media-generation-guards.service';

describe('MediaGenerationGuardsService', () => {
  const createService = ({
    textRoute = null,
    imageRoute = null,
  }: {
    textRoute?: object | null;
    imageRoute?: object | null;
  } = {}) => {
    const contestMediaGenerationResolverService = {
      assertContestCapability: jest.fn(),
    };
    const mediaRouteResolverService = {
      resolvePromptImageRoute: jest.fn(),
      resolveImageEditRoute: jest.fn(),
      resolveTextVideoRoute: jest.fn(async () => textRoute),
      resolveImageVideoRoute: jest.fn(async () => imageRoute),
    };
    const mediaGenerationPricingService = {
      getVideoCost: jest.fn(async () => 20),
    };
    const userRepository = {
      findOne: jest.fn(async () => ({ id: 7, points: 100 })),
    };
    const memeRepository = {
      findOne: jest.fn(),
    };

    const service = new MediaGenerationGuardsService(
      contestMediaGenerationResolverService as any,
      mediaRouteResolverService as any,
      mediaGenerationPricingService as any,
      userRepository as any,
      memeRepository as any,
    );

    return {
      service,
      mediaRouteResolverService,
      mediaGenerationPricingService,
      userRepository,
    };
  };

  it('validates the text-video route before approving its cost', async () => {
    const {
      service,
      mediaRouteResolverService,
      mediaGenerationPricingService,
    } = createService({ textRoute: { aiService: 'p_video_text' } });

    await expect(
      service.assertUserCanGenerateVideos(
        {
          aiService: 'p_video_text',
          prompt: 'waves at sunset',
          orientation: 'horizontal',
          duration: 5,
        },
        7,
      ),
    ).resolves.toBe(20);

    expect(
      mediaRouteResolverService.resolveTextVideoRoute,
    ).toHaveBeenCalledWith('p_video_text');
    expect(
      mediaRouteResolverService.resolveImageVideoRoute,
    ).not.toHaveBeenCalled();
    expect(mediaGenerationPricingService.getVideoCost).toHaveBeenCalledWith(
      'p_video_text',
      5,
    );
  });

  it('validates the image-video route for requests with a source image', async () => {
    const { service, mediaRouteResolverService } = createService({
      imageRoute: { aiService: 'p_video_image' },
    });

    await expect(
      service.assertUserCanGenerateVideos(
        {
          aiService: 'p_video_image',
          prompt: 'subtle movement',
          imageUrl: 'https://cdn.test/source.png',
          orientation: 'vertical',
          duration: 5,
        },
        7,
      ),
    ).resolves.toBe(20);

    expect(
      mediaRouteResolverService.resolveImageVideoRoute,
    ).toHaveBeenCalledWith('p_video_image');
    expect(
      mediaRouteResolverService.resolveTextVideoRoute,
    ).not.toHaveBeenCalled();
  });

  it('rejects an unavailable video route before reading the user or price', async () => {
    const { service, mediaGenerationPricingService, userRepository } =
      createService();

    await expect(
      service.assertUserCanGenerateVideos(
        {
          aiService: 'p_video_text',
          prompt: 'waves at sunset',
          orientation: 'horizontal',
          duration: 5,
        },
        7,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'No video generation route configured for p_video_text.',
      ),
    );

    expect(userRepository.findOne).not.toHaveBeenCalled();
    expect(mediaGenerationPricingService.getVideoCost).not.toHaveBeenCalled();
  });
});
