import { BadRequestException } from '@nestjs/common';
import { ContestService } from './contest.service';

describe('ContestService fine-tune model compatibility', () => {
  const createService = (fineTune: Record<string, unknown> | null) => {
    const aiFinetuneRepository = {
      findOne: jest.fn(async () => fineTune),
    };
    const service = new ContestService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aiFinetuneRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, aiFinetuneRepository };
  };

  it('accepts a validated Krea 2 profile through both contest lookup paths', async () => {
    const fineTune = {
      id: 7,
      loraKey: 'krea2_key',
      modelFamily: 'krea2',
      status: 'ready',
      loraUrl: 'https://example.com/krea2.safetensors',
      loraSha256: 'a'.repeat(64),
      loraStep: 1000,
      inferenceModel: 'krea/Krea-2-Turbo',
    };
    const { service } = createService(fineTune);

    await expect((service as any).getReadyFineTuneById(7)).resolves.toBe(
      fineTune,
    );
    await expect(
      (service as any).assertReadyFineTune('krea2_key'),
    ).resolves.toBe(fineTune);
  });

  it('rejects a legacy SDXL profile through both Krea 2 contest lookup paths', async () => {
    const fineTune = {
      id: 8,
      loraKey: 'sdxl_key',
      modelFamily: 'sdxl',
      status: 'ready',
      loraUrl: 'https://example.com/sdxl.safetensors',
    };
    const { service, aiFinetuneRepository } = createService(fineTune);

    await expect(
      (service as any).getReadyFineTuneById(8),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      (service as any).assertReadyFineTune('sdxl_key'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aiFinetuneRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: 8, modelFamily: 'krea2' },
    });
    expect(aiFinetuneRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { loraKey: 'sdxl_key', modelFamily: 'krea2' },
    });
  });
});
