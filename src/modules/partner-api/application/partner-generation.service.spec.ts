import { BadRequestException } from '@nestjs/common';
import { PartnerGenerationService } from './partner-generation.service';
import { HostedGenerationError } from '../infrastructure/hosted-media.client';

describe('PartnerGenerationService', () => {
  let hosted: { generate: jest.Mock };
  let inhouse: {
    generatePromptImages: jest.Mock;
    editImages: jest.Mock;
    generateImageVideos: jest.Mock;
  };
  let usage: { insert: jest.Mock };
  let service: PartnerGenerationService;

  beforeEach(() => {
    hosted = {
      generate: jest.fn().mockResolvedValue({
        url: 'https://cdn.example/a.png',
        executionMs: 1200,
      }),
    };
    inhouse = {
      generatePromptImages: jest
        .fn()
        .mockResolvedValue({ imageUrls: ['https://ours/1.png'] }),
      editImages: jest
        .fn()
        .mockResolvedValue({ imageUrls: ['https://ours/2.png'] }),
      generateImageVideos: jest
        .fn()
        .mockResolvedValue({ videoUrl: 'https://ours/3.mp4' }),
    };
    usage = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new PartnerGenerationService(
      hosted as never,
      inhouse as never,
      usage as never,
    );
  });

  const run = (overrides: Record<string, unknown> = {}) =>
    service.generate(
      {
        model: 'yengine-photo',
        prompt: 'a cat',
        capability: 'text_to_image',
        ...overrides,
      } as never,
      7,
    );

  it('sends a hosted model upstream and prices the response', async () => {
    const result = await run();

    expect(hosted.generate).toHaveBeenCalledTimes(1);
    expect(hosted.generate.mock.calls[0][0]).toBe('p-image');
    expect(result.model).toBe('yengine-photo');
    expect(result.data).toHaveLength(1);
    expect(result.usage.price_usd).toBe(0.015);
  });

  it('sends an in-house model to our own provider', async () => {
    const result = await run({ model: 'yengine-photo-alt' });

    expect(hosted.generate).not.toHaveBeenCalled();
    expect(inhouse.generatePromptImages).toHaveBeenCalledTimes(1);
    expect(result.data[0].url).toBe('https://ours/1.png');
  });

  it('charges per output when several are requested', async () => {
    const result = await run({ n: 3 });

    expect(hosted.generate).toHaveBeenCalledTimes(3);
    expect(result.data).toHaveLength(3);
    expect(result.usage.price_usd).toBeCloseTo(0.045, 5);
  });

  it('varies the seed across a batch so the outputs differ', async () => {
    const result = await run({ n: 3, seed: 42 });

    expect(result.data.map((output) => output.seed)).toEqual([42, 43, 44]);
  });

  it('rejects a model used on the wrong endpoint', async () => {
    await expect(
      run({ model: 'yengine-edit', capability: 'text_to_image' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown model', async () => {
    await expect(run({ model: 'gpt-image-2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a size the model does not offer', async () => {
    await expect(run({ size: '4096x4096' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires a reference image for editing', async () => {
    await expect(
      run({ model: 'yengine-edit', capability: 'image_to_image' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('caps reference images at three', async () => {
    await expect(
      run({
        model: 'yengine-edit',
        capability: 'image_to_image',
        images: ['a', 'b', 'c', 'd'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never leaks the upstream in a failure', async () => {
    hosted.generate.mockRejectedValue(
      new HostedGenerationError('pruna p-image 502 from api.pruna.ai', 'poll'),
    );

    await expect(run()).rejects.toMatchObject({
      response: {
        error: {
          type: 'generation_error',
          message: expect.not.stringContaining('pruna'),
        },
      },
    });
  });

  it('records the failure with our cost and a zero price', async () => {
    hosted.generate.mockRejectedValue(
      new HostedGenerationError('boom', 'submit'),
    );

    await expect(run()).rejects.toBeTruthy();
    expect(usage.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerKeyId: 7,
        model: 'yengine-photo',
        status: 'failed',
        failureCode: 'submit',
        priceUsd: '0.00000',
      }),
    );
  });

  it('still returns the images when the usage row cannot be written', async () => {
    usage.insert.mockRejectedValue(new Error('db down'));

    await expect(run()).resolves.toMatchObject({ model: 'yengine-photo' });
  });

  it('records what we paid alongside what the partner paid', async () => {
    await run();

    expect(usage.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'hosted',
        priceUsd: '0.01500',
        costUsd: '0.00500',
        status: 'succeeded',
      }),
    );
  });
});
