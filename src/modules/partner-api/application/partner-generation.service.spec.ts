import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PartnerGenerationService } from './partner-generation.service';
import { HostedGenerationError } from '../infrastructure/hosted-media.client';

describe('PartnerGenerationService', () => {
  let hosted: { generate: jest.Mock };
  let inhouse: {
    generatePromptImages: jest.Mock;
    editImages: jest.Mock;
    generateImageVideos: jest.Mock;
  };
  let uploads: { uploadByUrl: jest.Mock; uploadVideoAssetByUrl: jest.Mock };
  let billing: { hold: jest.Mock; settle: jest.Mock };
  let jobs: FakeJobService;
  let queue: { add: jest.Mock };
  let service: PartnerGenerationService;

  // Enough of PartnerJobService to hold a row in memory; the real one is covered by its own
  // spec, and stubbing it here keeps these tests about generation and money.
  class FakeJobService {
    rows: Record<string, unknown>[] = [];
    create = jest.fn(async (input: Record<string, unknown>) => {
      const row = {
        id: this.rows.length + 1,
        publicId: `job_${this.rows.length + 1}`,
        partnerKeyId: (input.partnerKey as { id: number }).id,
        accountId: (input.partnerKey as { accountId: number }).accountId,
        usageId: null,
        heldUsd: '0.0000',
        status: 'queued',
        ...input,
      };
      this.rows.push(row);
      return row;
    });
    attachHold = jest.fn(async () => undefined);
    markRunning = jest.fn(async () => undefined);
    markSucceeded = jest.fn(async () => undefined);
    markFailed = jest.fn(async () => undefined);
  }

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
    uploads = {
      uploadByUrl: jest.fn().mockResolvedValue('https://ours/rehosted.png'),
      uploadVideoAssetByUrl: jest
        .fn()
        .mockResolvedValue({ videoUrl: 'https://ours/rehosted.mp4' }),
    };
    billing = {
      hold: jest
        .fn()
        .mockResolvedValue({ usageId: 11, accountId: 5, heldUsd: 0.015 }),
      settle: jest.fn().mockResolvedValue(undefined),
    };
    jobs = new FakeJobService();
    queue = { add: jest.fn().mockResolvedValue({ id: '1' }) };
    service = new PartnerGenerationService(
      hosted as never,
      inhouse as never,
      uploads as never,
      billing as never,
      jobs as never,
      queue as never,
    );
  });

  const KEY = { id: 7, accountId: 5 } as never;

  const run = (overrides: Record<string, unknown> = {}, key: unknown = KEY) =>
    service.generate(
      {
        model: 'yengine-photo',
        prompt: 'a cat',
        capability: 'text_to_image',
        ...overrides,
      } as never,
      key as never,
    );

  it('sends a hosted model upstream and prices the response', async () => {
    const result = await run();

    expect(hosted.generate).toHaveBeenCalledTimes(1);
    expect(hosted.generate.mock.calls[0][0]).toBe('p-image');
    expect(result.model).toBe('yengine-photo');
    expect(result.data).toHaveLength(1);
    expect(result.usage.price_usd).toBe(0.015);
  });

  // The delivery URL names the upstream and expires, so handing it straight back would
  // both publish who runs the model and give the partner a link that dies.
  it('rehosts a hosted image and never returns the upstream URL', async () => {
    hosted.generate.mockResolvedValue({
      url: 'https://api.pruna.ai/v1/predictions/delivery/xyz/out.jpeg',
      executionMs: 900,
    });

    const result = await run();

    expect(uploads.uploadByUrl).toHaveBeenCalledWith(
      'https://api.pruna.ai/v1/predictions/delivery/xyz/out.jpeg',
    );
    expect(result.data[0].url).toBe('https://ours/rehosted.png');
    expect(JSON.stringify(result)).not.toContain('pruna');
  });

  it('rehosts a hosted video through the video path', async () => {
    const result = await run({
      model: 'yengine-video',
      capability: 'image_to_video',
      images: ['https://cdn.example/in.jpg'],
      size: '480p',
    });

    expect(uploads.uploadVideoAssetByUrl).toHaveBeenCalledTimes(1);
    expect(result.data[0].url).toBe('https://ours/rehosted.mp4');
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

  it('still returns the images when settlement cannot be written', async () => {
    billing.settle.mockRejectedValue(new Error('db down'));

    await expect(run()).resolves.toMatchObject({ model: 'yengine-photo' });
  });

  describe('billing', () => {
    it('holds the money before any work is dispatched', async () => {
      billing.hold.mockImplementation(async () => {
        expect(hosted.generate).not.toHaveBeenCalled();
        return { usageId: 11, accountId: 5, heldUsd: 0.015 };
      });

      await run();

      expect(billing.hold).toHaveBeenCalledWith(
        7,
        5,
        expect.objectContaining({ id: 'yengine-photo' }),
        1,
      );
    });

    it('does not dispatch when the balance cannot cover the call', async () => {
      billing.hold.mockRejectedValue(
        new HttpException(
          { error: { type: 'insufficient_balance', message: 'Top up' } },
          HttpStatus.PAYMENT_REQUIRED,
        ),
      );

      await expect(run()).rejects.toMatchObject({
        status: 402,
        response: { error: { type: 'insufficient_balance' } },
      });
      expect(hosted.generate).not.toHaveBeenCalled();
      expect(billing.settle).not.toHaveBeenCalled();
    });

    it('settles a success at what was actually produced', async () => {
      await run({ n: 2 });

      expect(billing.settle).toHaveBeenCalledWith(
        expect.objectContaining({ usageId: 11 }),
        expect.objectContaining({
          status: 'succeeded',
          priceUsd: 0.03,
          costUsd: 0.01,
          failureCode: null,
        }),
      );
    });

    // The partner is refunded, but what we burned still has to be recorded — otherwise a
    // key that fails constantly looks free in every report we have.
    it('settles a partial batch at the cost of the outputs that did land', async () => {
      hosted.generate
        .mockResolvedValueOnce({ url: 'https://cdn/1.png', executionMs: 900 })
        .mockResolvedValueOnce({ url: 'https://cdn/2.png', executionMs: 900 })
        .mockRejectedValueOnce(new HostedGenerationError('boom', 'poll'));

      await expect(run({ n: 3 })).rejects.toBeTruthy();

      expect(billing.settle).toHaveBeenCalledWith(
        expect.objectContaining({ usageId: 11 }),
        expect.objectContaining({
          status: 'failed',
          priceUsd: 0,
          costUsd: 0.01,
          failureCode: 'poll',
        }),
      );
    });

    it('settles a failure that produced nothing at zero cost', async () => {
      hosted.generate.mockRejectedValue(
        new HostedGenerationError('boom', 'submit'),
      );

      await expect(run()).rejects.toBeTruthy();

      expect(billing.settle).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', costUsd: 0 }),
      );
    });
  });

  describe('callback_url', () => {
    const submit = (overrides: Record<string, unknown> = {}) =>
      service.submit(
        {
          model: 'yengine-photo',
          prompt: 'a cat',
          capability: 'text_to_image',
          callbackUrl: 'https://partner.example/hook',
          ...overrides,
        } as never,
        KEY,
      );

    it('queues the work instead of running it', async () => {
      const job = await submit();

      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        { jobId: job.id },
        expect.objectContaining({ attempts: 1 }),
      );
      expect(hosted.generate).not.toHaveBeenCalled();
    });

    // The whole point of holding synchronously: an empty balance is an answer to the
    // request, not something the partner finds out from a callback a minute later.
    it('takes the money before accepting, and queues nothing when it cannot', async () => {
      billing.hold.mockRejectedValue(
        new HttpException(
          { error: { type: 'insufficient_balance', message: 'Top up' } },
          HttpStatus.PAYMENT_REQUIRED,
        ),
      );

      await expect(submit()).rejects.toMatchObject({ status: 402 });
      expect(queue.add).not.toHaveBeenCalled();
      expect(jobs.markFailed).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'insufficient_balance' }),
      );
    });

    // A queue that will not take the job has to give the money back on the spot: nothing
    // downstream will ever look at this row again.
    it('refunds when the queue refuses the job', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));

      await expect(submit()).rejects.toMatchObject({
        response: { error: { type: 'generation_error' } },
      });
      expect(billing.settle).toHaveBeenCalledWith(
        expect.objectContaining({ usageId: 11 }),
        expect.objectContaining({ status: 'failed', priceUsd: 0 }),
      );
    });

    it('rejects a bad model before a job is created', async () => {
      await expect(submit({ model: 'gpt-image-2' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('does not queue anything when no callback is asked for', async () => {
      await run();

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('records the outcome on the job row for the worker to deliver', async () => {
      const job = await submit();
      await service.execute(job as never);

      expect(jobs.markSucceeded).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({
          data: [
            { url: 'https://ours/rehosted.png', seed: expect.any(Number) },
          ],
        }),
      );
    });

    it('records a failure on the job row rather than losing it', async () => {
      hosted.generate.mockRejectedValue(
        new HostedGenerationError('pruna exploded', 'poll'),
      );
      const job = await submit();

      await expect(service.execute(job as never)).rejects.toBeTruthy();

      expect(jobs.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({
          type: 'generation_error',
          message: expect.not.stringContaining('pruna'),
        }),
      );
    });
  });
});
