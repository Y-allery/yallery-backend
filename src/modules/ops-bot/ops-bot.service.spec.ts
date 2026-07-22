import { OpsBotService } from './ops-bot.service';

/**
 * Covers the two HIGH-severity defects an adversarial review caught:
 *  1. The webhook had no chat authorization — any Telegram user who found the
 *     bot could pull live revenue/generation stats.
 *  2. The debounce committed "sent" (and wiped the suppressed count) BEFORE
 *     confirming delivery, so a misconfigured chat id or a Telegram outage
 *     silently ate the alert AND poisoned the next 10 minutes of the same
 *     failure with no trace.
 * Plus formatYepStats' fallback safety (never let one bad reward row 500 the
 * whole report) and the sandbox/pointsCredited data-accuracy fix.
 */
describe('OpsBotService', () => {
  const CONFIG: Record<string, any> = {
    TELEGRAM_OPS_CHAT_ID: '111',
  };

  const makeService = ({
    telegramSendResult = true,
    purchases = [] as any[],
    charges = [] as any[],
    usage = { image: {}, video: {} },
  }: any = {}) => {
    const postRepository = {};
    const chargeRepository = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          select: jest.fn(() => qb),
          addSelect: jest.fn(() => qb),
          where: jest.fn(() => qb),
          andWhere: jest.fn(() => qb),
          groupBy: jest.fn(() => qb),
          getRawMany: jest.fn(async () => charges),
        };
        return qb;
      }),
    };
    const paymentRepository = { find: jest.fn(async () => purchases) };
    const rewardService = {
      getRewardPoints: jest.fn(async () => 5000),
      getRewardPointsOrDefault: jest.fn(async (_t: any, def: number) => def),
    };
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => CONFIG[key] ?? null),
      getNumber: jest.fn(async () => undefined),
    };
    const aiUsageCollector = { collect: jest.fn(async () => usage) };
    const telegram = {
      sendMessage: jest.fn(async () => telegramSendResult),
      sendMessageWithKeyboard: jest.fn(async () => true),
      answerCallbackQuery: jest.fn(async () => true),
    };

    const service = new OpsBotService(
      postRepository as any,
      chargeRepository as any,
      paymentRepository as any,
      rewardService as any,
      providerRuntimeConfigService as any,
      aiUsageCollector as any,
      telegram as any,
    );
    return { service, telegram, rewardService, paymentRepository };
  };

  describe('chat authorization', () => {
    it('ignores /start from a chat that is not the configured ops chat', async () => {
      const { service, telegram } = makeService();

      await service.handleUpdate({
        update_id: 1,
        message: { message_id: 1, text: '/start', chat: { id: 999 } },
      } as any);

      expect(telegram.sendMessageWithKeyboard).not.toHaveBeenCalled();
    });

    it('answers the callback query (stops the spinner) but leaks no stats to an unauthorized chat', async () => {
      const { service, telegram } = makeService();

      await service.handleUpdate({
        update_id: 2,
        callback_query: {
          id: 'cb-1',
          data: 'stats:yep',
          message: { chat: { id: 999 } },
        },
      } as any);

      expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb-1');
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('serves the menu to the configured ops chat', async () => {
      const { service, telegram } = makeService();

      await service.handleUpdate({
        update_id: 3,
        message: { message_id: 1, text: '/start', chat: { id: 111 } },
      } as any);

      expect(telegram.sendMessageWithKeyboard).toHaveBeenCalledWith(
        '111',
        expect.any(String),
        expect.any(Array),
      );
    });

    it('fails closed when no ops chat id is configured at all', async () => {
      const { telegram } = makeService();
      const svc = new OpsBotService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { getString: jest.fn(async () => null), getNumber: jest.fn(async () => undefined) } as any,
        { collect: jest.fn() } as any,
        telegram as any,
      );

      await svc.handleUpdate({
        update_id: 4,
        message: { message_id: 1, text: '/start', chat: { id: 111 } },
      } as any);

      expect(telegram.sendMessageWithKeyboard).not.toHaveBeenCalled();
    });
  });

  describe('debounced alerts commit only on confirmed delivery', () => {
    it('starts the cooldown after a successful send', async () => {
      const { service, telegram } = makeService({ telegramSendResult: true });

      await service.notifyRunpodFailure({
        aiService: 'qwen_image',
        message: 'boom',
      });
      await service.notifyRunpodFailure({
        aiService: 'qwen_image',
        message: 'boom again',
      });

      // Second call within the cooldown window is suppressed -> one send only.
      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does NOT start the cooldown when delivery fails, so the next failure retries immediately', async () => {
      const { service, telegram } = makeService({ telegramSendResult: false });

      await service.notifyRunpodFailure({
        aiService: 'qwen_image',
        message: 'boom',
      });
      await service.notifyRunpodFailure({
        aiService: 'qwen_image',
        message: 'boom again',
      });

      // Both attempts actually reached Telegram — a failed send must not be
      // mistaken for "delivered, now cool down".
      expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('does not spend the cooldown when the ops chat id is unconfigured', async () => {
      const telegram = {
        sendMessage: jest.fn(async () => true),
      };
      const service = new OpsBotService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { getString: jest.fn(async () => null), getNumber: jest.fn(async () => undefined) } as any,
        {} as any,
        telegram as any,
      );

      await service.notifyRunpodFailure({ aiService: 'sdxl', message: 'x' });
      await service.notifyRunpodFailure({ aiService: 'sdxl', message: 'y' });

      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('fingerprints backend errors on the caller-supplied fingerprint, not the raw text', async () => {
      const { service, telegram } = makeService({ telegramSendResult: true });

      await service.notifyBackendError('Cannot find user 111', 'NotFoundException');
      await service.notifyBackendError('Cannot find user 222', 'NotFoundException');

      // Same fingerprint, different message text -> still debounced as one bug.
      expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatYepStats', () => {
    it('sums the amount frozen at credit time, not a live recompute', async () => {
      const { service, rewardService } = makeService({
        purchases: [
          { productId: '5000yeps', pointsCredited: 5000, currency: 'USD', amount: 4.99 },
          { productId: '15000yeps', pointsCredited: 15000, currency: 'USD', amount: 9.99 },
        ],
      });

      const text = await service.formatYepStats();

      expect(text).toContain('YEP нараховано: 20000');
      // pointsCredited was present on both rows -> the live reward lookup is
      // never consulted.
      expect(rewardService.getRewardPointsOrDefault).not.toHaveBeenCalled();
    });

    it('falls back to the live reward config for legacy rows with no pointsCredited, and never throws', async () => {
      const { service, rewardService } = makeService({
        purchases: [
          { productId: '5000yeps', pointsCredited: null, currency: 'USD', amount: 4.99 },
        ],
      });
      rewardService.getRewardPointsOrDefault = jest.fn(async (_t: any, _def: number) => 5000);

      const text = await service.formatYepStats();

      expect(text).toContain('YEP нараховано: 5000');
      expect(rewardService.getRewardPointsOrDefault).toHaveBeenCalled();
    });
  });
});
