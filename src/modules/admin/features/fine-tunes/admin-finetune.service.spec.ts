import { In } from 'typeorm';
import { AdminFineTuneService } from './admin-finetune.service';

describe('AdminFineTuneService', () => {
  const createService = () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (item) => item),
      create: jest.fn(),
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
    return { service, repository, runpodClient };
  };

  const activeItem = (id: number, overrides = {}) => ({
    id,
    status: 'training',
    runpodEndpointId: 'ep-1',
    runpodJobId: `job-${id}`,
    loraUrl: null,
    errorMessage: null,
    rawOutput: null,
    ...overrides,
  });

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

      expect(runpodClient.getJobStatus).toHaveBeenCalledWith('ep-1', 'job-7');
      expect(repository.save).toHaveBeenCalledWith(item);
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('oom');
    });
  });
});
