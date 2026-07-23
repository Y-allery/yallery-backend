import { In } from 'typeorm';
import { AdminFineTuneService } from './admin-finetune.service';

describe('AdminFineTuneService', () => {
  const createService = () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (item) => item),
      create: jest.fn().mockImplementation((item) => item),
    };
    const loraKeyService = {
      normalize: jest.fn(),
      generateUnique: jest.fn(),
    };
    const runpodClient = {
      getEndpointId: jest.fn(),
      submitJob: jest.fn(),
      getJobStatus: jest.fn(),
    };
    const service = new AdminFineTuneService(
      repository as any,
      loraKeyService as any,
      runpodClient as any,
    );
    return { service, repository, loraKeyService, runpodClient };
  };

  const activeItem = (id: number, overrides = {}) => ({
    id,
    status: 'training',
    modelFamily: 'sdxl',
    baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
    runpodEndpointId: 'ep-1',
    runpodJobId: `job-${id}`,
    loraUrl: null,
    errorMessage: null,
    rawOutput: null,
    ...overrides,
  });

  const datasetImages = Array.from({ length: 10 }, (_, index) => ({
    url: `https://cdn.test/${index}.png`,
    caption: `xoob_character scene ${index}`,
  }));

  describe('getFineTunes', () => {
    it('is a pure read: one find, no RunPod calls, no writes', async () => {
      const { service, repository, runpodClient } = createService();
      const rows = [activeItem(1), activeItem(2, { status: 'ready' })];
      repository.find.mockResolvedValue(rows);

      const result = await service.getFineTunes();

      expect(result).toBe(rows);
      expect(repository.find).toHaveBeenCalledTimes(1);
      expect(repository.find).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC' },
      });
      expect(runpodClient.getJobStatus).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('applies the optional status filter', async () => {
      const { service, repository } = createService();

      await service.getFineTunes('ready');

      expect(repository.find).toHaveBeenCalledWith({
        where: { status: 'ready' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('refreshActiveFineTunes', () => {
    it('queries only active statuses and refreshes each via RunPod', async () => {
      const { service, repository, runpodClient } = createService();
      const items = [activeItem(1), activeItem(2)];
      repository.find.mockResolvedValue(items);
      runpodClient.getJobStatus.mockResolvedValue({
        id: 'job',
        status: 'COMPLETED',
        output: { loraUrl: 'https://lora' },
      });

      await service.refreshActiveFineTunes();

      expect(repository.find).toHaveBeenCalledWith({
        where: { status: In(['pending', 'queued', 'training']) },
      });
      expect(runpodClient.getJobStatus).toHaveBeenCalledTimes(2);
      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(items[0].status).toBe('ready');
      expect(items[0].loraUrl).toBe('https://lora');
    });

    it('continues the sweep when one refresh fails', async () => {
      const { service, repository, runpodClient } = createService();
      const items = [activeItem(1), activeItem(2)];
      repository.find.mockResolvedValue(items);
      runpodClient.getJobStatus
        .mockRejectedValueOnce(new Error('runpod down'))
        .mockResolvedValueOnce({ id: 'job-2', status: 'IN_PROGRESS' });

      await expect(service.refreshActiveFineTunes()).resolves.toBeUndefined();

      expect(runpodClient.getJobStatus).toHaveBeenCalledTimes(2);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('caps RunPod concurrency at 3', async () => {
      const { service, repository, runpodClient } = createService();
      repository.find.mockResolvedValue([1, 2, 3, 4, 5].map(activeItem));

      let inFlight = 0;
      let maxInFlight = 0;
      runpodClient.getJobStatus.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return { id: 'job', status: 'IN_PROGRESS' };
      });

      await service.refreshActiveFineTunes();

      expect(runpodClient.getJobStatus).toHaveBeenCalledTimes(5);
      expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    it('skips a sweep while one is already running', async () => {
      const { service, repository, runpodClient } = createService();
      let releaseFind: (items: any[]) => void;
      repository.find.mockReturnValue(
        new Promise((resolve) => {
          releaseFind = resolve;
        }),
      );

      const firstSweep = service.refreshActiveFineTunes();
      await service.refreshActiveFineTunes();

      expect(repository.find).toHaveBeenCalledTimes(1);

      releaseFind([]);
      await firstSweep;

      repository.find.mockResolvedValue([]);
      await service.refreshActiveFineTunes();
      expect(repository.find).toHaveBeenCalledTimes(2);
      expect(runpodClient.getJobStatus).not.toHaveBeenCalled();
    });

    it('swallows repository errors and releases the in-flight guard', async () => {
      const { service, repository } = createService();
      repository.find.mockRejectedValueOnce(new Error('db down'));

      await expect(service.refreshActiveFineTunes()).resolves.toBeUndefined();

      repository.find.mockResolvedValue([]);
      await service.refreshActiveFineTunes();
      expect(repository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFineTuneStatus', () => {
    it('still live-refreshes a single fine-tune from RunPod', async () => {
      const { service, repository, runpodClient } = createService();
      const item = activeItem(7);
      repository.findOne.mockResolvedValue(item);
      runpodClient.getJobStatus.mockResolvedValue({
        id: 'job-7',
        status: 'FAILED',
        error: 'oom',
      });

      const result = await service.getFineTuneStatus(7);

      expect(runpodClient.getJobStatus).toHaveBeenCalledWith(
        'sdxl',
        'ep-1',
        'job-7',
      );
      expect(repository.save).toHaveBeenCalledWith(item);
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('oom');
    });

    it('accepts a Krea 2 artifact only when worker compatibility metadata matches', async () => {
      const { service, repository, runpodClient } = createService();
      const item = activeItem(8, {
        modelFamily: 'krea2',
        baseModel: 'krea/Krea-2-Raw',
      });
      repository.findOne.mockResolvedValue(item);
      runpodClient.getJobStatus.mockResolvedValue({
        id: 'job-8',
        status: 'COMPLETED',
        output: {
          loraUrl: 'https://cdn.test/xoob-krea2.safetensors',
          modelFamily: 'krea2',
          baseModel: 'krea/Krea-2-Raw',
        },
      });

      const result = await service.getFineTuneStatus(8);

      expect(runpodClient.getJobStatus).toHaveBeenCalledWith(
        'krea2',
        'ep-1',
        'job-8',
      );
      expect(result.status).toBe('ready');
      expect(result.loraUrl).toBe('https://cdn.test/xoob-krea2.safetensors');
      expect(result.errorMessage).toBeNull();
    });

    it('quarantines a completed Krea 2 artifact without compatibility metadata', async () => {
      const { service, repository, runpodClient } = createService();
      const item = activeItem(9, {
        modelFamily: 'krea2',
        baseModel: 'krea/Krea-2-Raw',
      });
      repository.findOne.mockResolvedValue(item);
      runpodClient.getJobStatus.mockResolvedValue({
        id: 'job-9',
        status: 'COMPLETED',
        output: {
          loraUrl: 'https://cdn.test/untyped.safetensors',
        },
      });

      const result = await service.getFineTuneStatus(9);

      expect(result.status).toBe('failed');
      expect(result.loraUrl).toBeNull();
      expect(result.errorMessage).toContain(
        'missing modelFamily compatibility metadata',
      );
    });

    it.each([
      [
        'the worker reports ready_with_validation_error',
        {
          status: 'ready_with_validation_error',
          validation: { status: 'passed' },
        },
        'RunPod Krea 2 validation failed',
      ],
      [
        'validation reports failed',
        {
          status: 'ready',
          validation: { status: 'failed', error: 'bad checkpoint' },
        },
        'bad checkpoint',
      ],
      [
        'validation reports error',
        {
          status: 'ready',
          validation: { status: 'error', error: 'validator crashed' },
        },
        'validator crashed',
      ],
      [
        'the worker returns an explicit validationError',
        {
          status: 'ready',
          validation: { status: 'passed' },
          validationError: 'validation upload failed',
        },
        'validation upload failed',
      ],
    ])(
      'quarantines a completed Krea 2 artifact when %s',
      async (_description, validationOutput, expectedError) => {
        const { service, repository, runpodClient } = createService();
        const item = activeItem(10, {
          modelFamily: 'krea2',
          baseModel: 'krea/Krea-2-Raw',
        });
        repository.findOne.mockResolvedValue(item);
        runpodClient.getJobStatus.mockResolvedValue({
          id: 'job-10',
          status: 'COMPLETED',
          output: {
            loraUrl: 'https://cdn.test/xoob-krea2.safetensors',
            modelFamily: 'krea2',
            baseModel: 'krea/Krea-2-Raw',
            ...validationOutput,
          },
        });

        const result = await service.getFineTuneStatus(10);

        expect(result.status).toBe('failed');
        expect(result.loraUrl).toBeNull();
        expect(result.errorMessage).toContain(expectedError);
      },
    );

    it('keeps legacy SDXL completion semantics when validation metadata is present', async () => {
      const { service, repository, runpodClient } = createService();
      const item = activeItem(11);
      repository.findOne.mockResolvedValue(item);
      runpodClient.getJobStatus.mockResolvedValue({
        id: 'job-11',
        status: 'COMPLETED',
        output: {
          status: 'ready_with_validation_error',
          validation: { status: 'failed', error: 'legacy validation error' },
          loraUrl: 'https://cdn.test/legacy-sdxl.safetensors',
        },
      });

      const result = await service.getFineTuneStatus(11);

      expect(result.status).toBe('ready');
      expect(result.loraUrl).toBe('https://cdn.test/legacy-sdxl.safetensors');
      expect(result.errorMessage).toBeNull();
    });
  });

  describe('createFineTune', () => {
    const configureCreationMocks = (deps: ReturnType<typeof createService>) => {
      deps.loraKeyService.normalize.mockImplementation((value: string) =>
        value?.trim(),
      );
      deps.loraKeyService.generateUnique.mockResolvedValue('xoob-character');
      deps.repository.findOne.mockResolvedValue(null);
      deps.runpodClient.getEndpointId.mockResolvedValue('trainer-endpoint');
      deps.runpodClient.submitJob.mockResolvedValue({
        id: 'job-new',
        status: 'IN_QUEUE',
      });
    };

    it('keeps legacy requests on SDXL with the existing defaults and URL payload', async () => {
      const deps = createService();
      configureCreationMocks(deps);

      const result = await deps.service.createFineTune({
        name: 'XOOB legacy',
        triggerWord: 'xoob_character',
        datasetImages,
      });

      expect(deps.runpodClient.getEndpointId).toHaveBeenCalledWith('sdxl');
      expect(deps.repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          modelFamily: 'sdxl',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          trainingSettings: {
            resolution: 512,
            maxTrainSteps: 800,
            rank: 4,
            trainBatchSize: 1,
            gradientAccumulationSteps: 4,
            learningRate: '1e-4',
            mixedPrecision: 'fp16',
            seed: 42,
            enableRandomFlip: false,
          },
        }),
      );
      expect(deps.runpodClient.submitJob).toHaveBeenCalledWith(
        'sdxl',
        expect.objectContaining({
          modelFamily: 'sdxl',
          datasetImages: datasetImages.map((image) => image.url),
          captionMode: 'template',
        }),
      );
      expect(result.status).toBe('queued');
    });

    it('uses Krea-2-Raw defaults and preserves per-image captions', async () => {
      const deps = createService();
      configureCreationMocks(deps);

      await deps.service.createFineTune({
        name: 'XOOB Krea 2',
        triggerWord: 'xoob_character',
        modelFamily: 'krea2',
        datasetImages,
        generationDefaults: {
          loraScale: 0.9,
        },
      });

      expect(deps.runpodClient.getEndpointId).toHaveBeenCalledWith('krea2');
      expect(deps.repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          modelFamily: 'krea2',
          baseModel: 'krea/Krea-2-Raw',
          trainingSettings: {
            resolution: 1024,
            maxTrainSteps: 1000,
            rank: 32,
            trainBatchSize: 1,
            gradientAccumulationSteps: 1,
            learningRate: '3e-4',
            mixedPrecision: 'bf16',
            seed: 0,
            enableRandomFlip: false,
          },
          generationDefaults: {
            loraScale: 0.9,
          },
        }),
      );
      expect(deps.runpodClient.submitJob).toHaveBeenCalledWith('krea2', {
        name: 'XOOB Krea 2',
        triggerWord: 'xoob_character',
        loraKey: 'xoob-character',
        className: 'character',
        modelFamily: 'krea2',
        baseModel: 'krea/Krea-2-Raw',
        datasetImages: datasetImages.map((image) => ({
          url: image.url,
          caption: image.caption,
        })),
        captionMode: 'per_image',
        resolution: 1024,
        maxTrainSteps: 1000,
        rank: 32,
        trainBatchSize: 1,
        gradientAccumulationSteps: 1,
        learningRate: '3e-4',
        mixedPrecision: 'bf16',
        seed: 0,
        enableRandomFlip: false,
        defaultLoraScale: 0.9,
        loraScale: 0.9,
      });
    });

    it('rejects a base model from another architecture family before queuing', async () => {
      const deps = createService();
      configureCreationMocks(deps);

      await expect(
        deps.service.createFineTune({
          name: 'Wrong base',
          triggerWord: 'xoob_character',
          modelFamily: 'krea2',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          datasetImages,
        }),
      ).rejects.toThrow('is not compatible with modelFamily "krea2"');

      expect(deps.runpodClient.getEndpointId).not.toHaveBeenCalled();
      expect(deps.runpodClient.submitJob).not.toHaveBeenCalled();
    });
  });
});
