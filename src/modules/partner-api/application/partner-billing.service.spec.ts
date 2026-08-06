import { PartnerBillingService } from './partner-billing.service';
import { PartnerAccountEntity } from '../entities/partner-account.entity';

/**
 * The debit is deliberately a conditional UPDATE rather than a read-then-write, so these
 * tests assert the SQL shape as much as the outcome: an implementation that reads the
 * balance and then subtracts would pass an outcome-only test and still let two concurrent
 * calls spend the same dollar.
 */
describe('PartnerBillingService', () => {
  let update: {
    calls: Array<{ set: unknown; wheres: string[]; params: unknown }>;
    affected: number;
  };
  let balance: number;
  let inserted: Array<Record<string, unknown>>;
  let savedUsage: { id: number };
  let service: PartnerBillingService;
  let recharge: { isDue: jest.Mock };
  let rechargeQueue: { add: jest.Mock };

  const buildManager = () => ({
    createQueryBuilder: () => {
      const record = {
        set: null as unknown,
        wheres: [] as string[],
        params: {},
      };
      const builder: Record<string, unknown> = {
        update: () => builder,
        set: (value: unknown) => {
          record.set = value;
          return builder;
        },
        where: (clause: string, params: unknown) => {
          record.wheres.push(clause);
          Object.assign(record.params, params);
          return builder;
        },
        andWhere: (clause: string, params: unknown) => {
          record.wheres.push(clause);
          Object.assign(record.params, params ?? {});
          return builder;
        },
        execute: async () => {
          update.calls.push(record as never);
          return { affected: update.affected };
        },
      };
      return builder;
    },
    getRepository: (entity: unknown) => ({
      findOne: async () =>
        entity === PartnerAccountEntity
          ? { id: 5, balanceUsd: balance.toFixed(4), isActive: true }
          : null,
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => {
        inserted.push({ table: 'usage', ...value });
        return savedUsage;
      },
      insert: async (value: Record<string, unknown>) => {
        inserted.push({ table: 'ledger', ...value });
        return { identifiers: [{ id: 99 }] };
      },
      update: async (criteria: unknown, value: Record<string, unknown>) => {
        inserted.push({ table: 'usage-update', criteria, ...value });
        return { affected: 1 };
      },
    }),
  });

  beforeEach(() => {
    update = { calls: [], affected: 1 };
    balance = 10;
    inserted = [];
    savedUsage = { id: 42 };
    recharge = { isDue: jest.fn().mockResolvedValue(false) };
    rechargeQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new PartnerBillingService(
      {
        transaction: async (fn: (m: unknown) => Promise<unknown>) =>
          fn(buildManager()),
        getRepository: () => ({
          findOne: async () => ({ id: 5, balanceUsd: balance.toFixed(4) }),
        }),
      } as never,
      recharge as never,
      rechargeQueue as never,
    );
  });

  const MODEL = {
    id: 'yengine-photo',
    capability: 'text_to_image',
    backend: 'hosted',
    target: 'p-image',
    priceUsd: 0.015,
    costUsd: 0.005,
    sizes: ['1024x1024'],
    description: '',
  } as never;

  describe('hold', () => {
    it('debits conditionally, so the balance can never go negative', async () => {
      await service.hold(7, 5, MODEL, 2);

      const debit = update.calls[0];
      expect(debit.wheres).toEqual(
        expect.arrayContaining(['balanceUsd >= :heldUsd']),
      );
      expect(debit.params).toMatchObject({ id: 5, heldUsd: 0.03 });
    });

    it('rejects with 402 when the conditional debit matches nothing', async () => {
      update.affected = 0;
      balance = 0.004;

      await expect(service.hold(7, 5, MODEL, 1)).rejects.toMatchObject({
        status: 402,
        response: { error: { type: 'insufficient_balance' } },
      });
    });

    it('opens the usage row as pending, priced at zero until it settles', async () => {
      await service.hold(7, 5, MODEL, 2);

      expect(inserted.find((row) => row.table === 'usage')).toMatchObject({
        partnerKeyId: 7,
        model: 'yengine-photo',
        status: 'pending',
        priceUsd: '0.00000',
        costUsd: '0.01000',
      });
    });

    it('writes a signed ledger row for the charge', async () => {
      await service.hold(7, 5, MODEL, 1);

      expect(inserted.find((row) => row.table === 'ledger')).toMatchObject({
        accountId: 5,
        kind: 'charge',
        amountUsd: '-0.0150',
        usageId: 42,
      });
    });

    it('skips the balance entirely for an internal key with no account', async () => {
      await service.hold(7, null, MODEL, 1);

      expect(update.calls).toHaveLength(0);
      expect(inserted.filter((row) => row.table === 'ledger')).toHaveLength(0);
      expect(inserted.find((row) => row.table === 'usage')).toBeTruthy();
    });
  });

  describe('settle', () => {
    const HOLD = { usageId: 42, accountId: 5, heldUsd: 0.045 };

    it('returns the unused part of a batch that produced fewer outputs', async () => {
      await service.settle(HOLD, {
        status: 'succeeded',
        executionMs: 1200,
        priceUsd: 0.015,
        costUsd: 0.005,
        failureCode: null,
      });

      expect(update.calls[0].set).toMatchObject({});
      expect(inserted.find((row) => row.table === 'ledger')).toMatchObject({
        kind: 'refund',
        amountUsd: '0.0300',
      });
    });

    it('refunds a failure in full and still records what it cost us', async () => {
      await service.settle(HOLD, {
        status: 'failed',
        executionMs: 800,
        priceUsd: 0,
        costUsd: 0.01,
        failureCode: 'poll',
      });

      expect(inserted.find((row) => row.table === 'ledger')).toMatchObject({
        kind: 'refund',
        amountUsd: '0.0450',
      });
      expect(
        inserted.find((row) => row.table === 'usage-update'),
      ).toMatchObject({
        status: 'failed',
        priceUsd: '0.00000',
        costUsd: '0.01000',
      });
    });

    it('moves no money when the whole hold was used', async () => {
      await service.settle(
        { usageId: 42, accountId: 5, heldUsd: 0.015 },
        {
          status: 'succeeded',
          executionMs: 900,
          priceUsd: 0.015,
          costUsd: 0.005,
          failureCode: null,
        },
      );

      expect(inserted.filter((row) => row.table === 'ledger')).toHaveLength(0);
    });

    // The images are already delivered by this point; throwing here would turn a good
    // response into a 500 and the partner would be refunded for work they received.
    it('never throws, even when the whole transaction fails', async () => {
      service = new PartnerBillingService(
        {
          transaction: async () => {
            throw new Error('deadlock');
          },
        } as never,
        recharge as never,
        rechargeQueue as never,
      );

      await expect(
        service.settle(HOLD, {
          status: 'succeeded',
          executionMs: 1,
          priceUsd: 0.015,
          costUsd: 0.005,
          failureCode: null,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
