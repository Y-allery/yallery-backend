import { BadRequestException } from '@nestjs/common';
import { ContestTypeEnum } from 'src/modules/contests/types/contest.status.enum';
import { ContestMediaGenerationResolverService } from './contest-media-generation-resolver.service';

describe('ContestMediaGenerationResolverService', () => {
  function createService() {
    const contestRepository = {
      findOne: jest.fn(),
    };
    const mediaAISettingsRepository = {
      findOne: jest.fn(),
    };
    const aiFinetuneRepository = {
      findOne: jest.fn(),
    };
    const contestFlowMetadataRepository = {
      count: jest.fn(async () => 1),
    };

    const service = new ContestMediaGenerationResolverService(
      contestRepository as any,
      mediaAISettingsRepository as any,
      aiFinetuneRepository as any,
      contestFlowMetadataRepository as any,
    );

    return {
      service,
      contestRepository,
      mediaAISettingsRepository,
      aiFinetuneRepository,
      contestFlowMetadataRepository,
    };
  }

  const fineTuneContest = {
    id: 42,
    contestType: ContestTypeEnum.FINE_TUNE,
    mediaAiSetting: null,
    fineTuneToken: 'codex_ft_key',
    fineTuneStrength: 0.85,
    fineTuneTriggerWord: 'codex_ft',
  };

  it('rejects explicit non-LoRA prompt model for fine-tune contests', async () => {
    const { service, contestRepository, mediaAISettingsRepository } =
      createService();
    contestRepository.findOne.mockResolvedValue(fineTuneContest);

    await expect(
      service.resolvePromptImageRequest({
        contestId: fineTuneContest.id,
        aiService: 'flux2_klein',
        prompt: 'test',
        imageQuantity: 1,
        orientation: 'vertical',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mediaAISettingsRepository.findOne).not.toHaveBeenCalled();
  });

  it('resolves omitted ai_service to contest LoRA settings for fine-tune contests', async () => {
    const {
      service,
      contestRepository,
      mediaAISettingsRepository,
      aiFinetuneRepository,
    } = createService();
    contestRepository.findOne.mockResolvedValue(fineTuneContest);
    mediaAISettingsRepository.findOne.mockResolvedValue({
      aiService: 'sdxl_lora_generation',
      capability: 'image_generate',
      isActive: true,
    });
    aiFinetuneRepository.findOne.mockResolvedValue({
      loraKey: 'codex_ft_key',
      loraUrl: 'https://example.com/lora.safetensors',
      triggerWord: 'fallback_trigger',
      status: 'ready',
      generationDefaults: { loraScale: 0.7 },
    });

    const result = await service.resolvePromptImageRequest({
      contestId: fineTuneContest.id,
      prompt: 'test',
      imageQuantity: 1,
      orientation: 'vertical',
    });

    expect(result.aiService).toBe('sdxl_lora_generation');
    expect(result.providerSettings).toMatchObject({
      loraKey: 'codex_ft_key',
      loraUrl: 'https://example.com/lora.safetensors',
      triggerWord: 'codex_ft',
      loraScale: 0.85,
    });
  });
});
