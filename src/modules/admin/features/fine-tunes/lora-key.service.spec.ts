import { LoraKeyService } from './lora-key.service';

describe('LoraKeyService', () => {
  it('normalizes trigger words into stable LoRA key parts', () => {
    const service = new LoraKeyService({ count: jest.fn() } as any);

    expect(service.normalize('  Nomisma Style!!  ', 80)).toBe(
      'nomisma_style',
    );
    expect(service.normalize('___ABC---123___', 80)).toBe('abc_123');
  });

  it('generates a unique key from a normalized base', async () => {
    const repository = {
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new LoraKeyService(repository as any);

    const result = await service.generateUnique('Nomisma Style');

    expect(result).toMatch(/^nomisma_style_[a-f0-9]{8}$/);
    expect(repository.count).toHaveBeenCalledWith({
      where: { loraKey: result },
    });
  });
});
