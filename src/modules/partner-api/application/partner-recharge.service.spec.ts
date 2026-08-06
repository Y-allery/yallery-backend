import { PartnerRechargeService } from './partner-recharge.service';

describe('PartnerRechargeService', () => {
  let execute: jest.Mock;
  let builder: Record<string, jest.Mock>;
  let accounts: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let service: PartnerRechargeService;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue({ affected: 1 });
    builder = {
      update: jest.fn(() => builder),
      set: jest.fn(() => builder),
      where: jest.fn(() => builder),
      andWhere: jest.fn(() => builder),
      execute,
    };
    accounts = {
      createQueryBuilder: jest.fn(() => builder),
      findOne: jest.fn().mockResolvedValue({
        id: 5,
        autoRechargeEnabled: true,
        autoRechargeFailures: 0,
        paymentMethodId: 'pm_1',
        balanceUsd: '3.0000',
        autoRechargeThresholdUsd: '5.0000',
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new PartnerRechargeService(accounts as never);
  });

  const conditions = () => builder.andWhere.mock.calls.map((call) => call[0]);

  describe('claim', () => {
    // Every condition belongs in the UPDATE. Reading them first and checking after lets
    // three generations that finish together each decide a top-up is due.
    it('decides everything inside the conditional update', async () => {
      await service.claim(5);

      const sql = conditions().join(' | ');
      expect(sql).toContain('rechargeInFlight = 0');
      expect(sql).toContain('autoRechargeEnabled = 1');
      expect(sql).toContain('paymentMethodId IS NOT NULL');
      expect(sql).toContain('balanceUsd < autoRechargeThresholdUsd');
      expect(sql).toContain('lastRechargeAt');
    });

    // The cooldown has to start when we decide to charge, not when the answer arrives.
    it('stamps the cooldown as part of claiming', async () => {
      await service.claim(5);

      const assigned = builder.set.mock.calls[0][0];
      expect(assigned.rechargeInFlight).toBe(true);
      expect(assigned.lastRechargeAt).toEqual(expect.any(Function));
    });

    it('returns nothing when another worker got there first', async () => {
      execute.mockResolvedValue({ affected: 0 });

      await expect(service.claim(5)).resolves.toBeNull();
      expect(accounts.findOne).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('keeps the rule on after a single decline', async () => {
      await service.recordFailure(5, 'card_declined');

      expect(accounts.update.mock.calls[0][1]).toMatchObject({
        rechargeInFlight: false,
        autoRechargeFailures: 1,
      });
      expect(
        accounts.update.mock.calls[0][1].autoRechargeEnabled,
      ).toBeUndefined();
    });

    // A card that declines twice declines a third time, and a bank watching a string of
    // retries draws its own conclusion about us.
    it('switches the rule off on the second decline and says why', async () => {
      accounts.findOne.mockResolvedValue({ id: 5, autoRechargeFailures: 1 });

      await service.recordFailure(5, 'authentication_required');

      const patch = accounts.update.mock.calls[0][1];
      expect(patch.autoRechargeEnabled).toBe(false);
      expect(patch.autoRechargeDisabledReason).toContain(
        'authentication_required',
      );
    });
  });

  describe('isDue', () => {
    it('is true below the trigger', async () => {
      await expect(service.isDue(5)).resolves.toBe(true);
    });

    it('is false with no card, however low the balance', async () => {
      accounts.findOne.mockResolvedValue({
        autoRechargeEnabled: true,
        paymentMethodId: null,
        balanceUsd: '0.0000',
        autoRechargeThresholdUsd: '5.0000',
      });

      await expect(service.isDue(5)).resolves.toBe(false);
    });

    it('is false when the rule is off', async () => {
      accounts.findOne.mockResolvedValue({
        autoRechargeEnabled: false,
        paymentMethodId: 'pm_1',
        balanceUsd: '0.0000',
        autoRechargeThresholdUsd: '5.0000',
      });

      await expect(service.isDue(5)).resolves.toBe(false);
    });
  });
});
