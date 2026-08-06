import { HttpException } from '@nestjs/common';
import { PartnerJobService } from './partner-job.service';
import { PartnerJobEntity } from '../entities/partner-job.entity';

describe('PartnerJobService', () => {
  let repository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let service: PartnerJobService;

  const CREATED_AT = new Date('2026-08-06T10:00:00Z');

  const row = (overrides: Partial<PartnerJobEntity> = {}): PartnerJobEntity =>
    ({
      id: 1,
      publicId: 'job_abc',
      model: 'yengine-photo',
      status: 'queued',
      createdAt: CREATED_AT,
      ...overrides,
    }) as PartnerJobEntity;

  beforeEach(() => {
    repository = {
      create: jest.fn((entity) => entity),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new PartnerJobService(repository as never);
  });

  describe('create', () => {
    it('marks a job with a callback as awaiting delivery, with a stable delivery id', async () => {
      await service.create({
        partnerKey: { id: 7, accountId: 5 } as never,
        model: 'yengine-photo',
        capability: 'text_to_image',
        request: { prompt: 'a cat' },
        callbackUrl: 'https://partner.example/hook',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackStatus: 'pending',
          callbackDeliveryId: expect.any(String),
        }),
      );
    });

    it('leaves a synchronous job with nothing to deliver', async () => {
      await service.create({
        partnerKey: { id: 7, accountId: null } as never,
        model: 'yengine-photo',
        capability: 'text_to_image',
        request: {},
        callbackUrl: null,
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackStatus: 'none',
          callbackDeliveryId: null,
        }),
      );
    });

    // A sequential id would tell every partner how much traffic the whole API takes.
    it('gives out an id that is not the row number', async () => {
      await service.create({
        partnerKey: { id: 7, accountId: 5 } as never,
        model: 'yengine-photo',
        capability: 'text_to_image',
        request: {},
        callbackUrl: null,
      });

      const { publicId } = repository.save.mock.calls[0][0];
      expect(publicId).toMatch(/^job_[0-9a-f]{24}$/);
    });
  });

  describe('findForKey', () => {
    it('scopes to the account, so any key on it can read the job', async () => {
      repository.findOne.mockResolvedValue(row());

      await service.findForKey('job_abc', { id: 7, accountId: 5 } as never);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { publicId: 'job_abc', accountId: 5 },
      });
    });

    // An internal key has no account, so account scoping would match every other one.
    it('scopes an accountless key to its own jobs', async () => {
      repository.findOne.mockResolvedValue(row());

      await service.findForKey('job_abc', { id: 7, accountId: null } as never);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { publicId: 'job_abc', partnerKeyId: 7 },
      });
    });

    it('answers 404 for somebody else’s job', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.findForKey('job_xyz', { id: 7, accountId: 5 } as never),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('view', () => {
    it('carries no result while the job is still queued', () => {
      expect(service.view(row())).toEqual({
        id: 'job_abc',
        object: 'generation',
        status: 'queued',
        model: 'yengine-photo',
        created: Math.floor(CREATED_AT.getTime() / 1000),
      });
    });

    it('returns the same body a synchronous call would have', () => {
      const view = service.view(
        row({
          status: 'succeeded',
          result: {
            data: [{ url: 'https://ours/1.png', seed: 42 }],
            usage: { generation_time_ms: 1200, price_usd: 0.015 },
          },
        }),
      );

      expect(view).toMatchObject({
        status: 'succeeded',
        data: [{ url: 'https://ours/1.png', seed: 42 }],
        usage: { generation_time_ms: 1200, price_usd: 0.015 },
      });
    });

    it('reports a failure in the documented error shape', () => {
      const view = service.view(
        row({
          status: 'failed',
          errorType: 'generation_error',
          errorMessage: 'Generation failed.',
        }),
      );

      expect(view.error).toEqual({
        type: 'generation_error',
        message: 'Generation failed.',
      });
      expect(view.data).toBeUndefined();
    });
  });
});
