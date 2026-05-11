import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { Repository } from 'typeorm';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { ContestMediaGenerationResolverService } from 'src/modules/media-generation/application/contest/contest-media-generation-resolver.service';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';

@Injectable()
export class MediaGenerationGuardsService {
  constructor(
    private readonly contestMediaGenerationResolverService: ContestMediaGenerationResolverService,
    private readonly mediaRouteResolverService: MediaRouteResolverService,
    private readonly mediaGenerationPricingService: MediaGenerationPricingService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
  ) {}

  async assertUserCanGeneratePromptImages(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'image_generate',
      );
    }

    await this.mediaGenerationPricingService.assertPromptImageQuantity(
      request.aiService,
      request.imageQuantity,
    );

    if (
      !(await this.mediaRouteResolverService.resolvePromptImageRoute(
        request.aiService,
      ))
    ) {
      throw new BadRequestException(
        `No prompt-image generation route configured for ${request.aiService}.`,
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getPromptImageCost(
        request.aiService,
        request.imageQuantity,
      );

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate images');
    }
  }

  async assertUserCanEditImages(
    request: EditImageGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'image_generate',
      );
    }

    if (
      !(await this.mediaRouteResolverService.resolveImageEditRoute(
        request.aiService,
      ))
    ) {
      throw new BadRequestException(
        `No image-edit generation route configured for ${request.aiService}.`,
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getImageEditCost(
        request.aiService,
      );

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to edit images');
    }
  }

  async assertUserCanGenerateAudio(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'audio_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getAudioCost(request.aiService);

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate audio');
    }
  }

  async assertUserCanGenerateVideos(
    request: TextVideoGenerationRequest | ImageVideoGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'video_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getVideoCost(
      request.aiService,
      request.duration,
    );

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate videos');
    }
  }

  async assertUserCanGenerateMemes(
    request: MemeGenerationRequest,
    userId: number,
  ) {
    const meme = await this.getRequiredMeme(request.memeId);

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getMemeCost(
      request.aiService,
      meme.referenceVideoDurationSeconds,
    );

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate memes');
    }
  }

  async getRequiredUser(userId: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { tags: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getRequiredMeme(memeId: number): Promise<MemeEntity> {
    const meme = await this.memeRepository.findOne({
      where: { id: memeId },
      relations: ['tag'],
    });

    if (!meme) {
      throw new NotFoundException(`Meme with id ${memeId} not found`);
    }

    if (!meme.isActive) {
      throw new BadRequestException('This meme template is not active');
    }

    if (!meme.referenceVideoUrl) {
      throw new BadRequestException(
        'Meme template has no reference video configured',
      );
    }

    if (!meme.tag) {
      throw new BadRequestException('Meme template has no tag assigned');
    }

    return meme;
  }
}
