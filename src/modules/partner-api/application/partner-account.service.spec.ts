import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  PARTNER_TOKEN_AUDIENCE,
  PartnerAccountService,
  partnerTokenSecret,
} from './partner-account.service';
import { hashPartnerKey } from '../infrastructure/partner-key.guard';

describe('PartnerAccountService', () => {
  let accounts: Record<string, jest.Mock>;
  let keys: Record<string, jest.Mock>;
  let service: PartnerAccountService;

  beforeEach(() => {
    accounts = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => ({ id: 1, ...value })),
      create: jest.fn((value) => value),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    keys = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 3, ...value })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new PartnerAccountService(accounts as never, keys as never);
  });

  describe('signing up', () => {
    it('stores the email lowercased and the password only as a hash', async () => {
      await service.signUp({ email: '  DEV@Acme.COM ', password: 'correct horse battery' });

      const saved = accounts.save.mock.calls[0][0];
      expect(saved.email).toBe('dev@acme.com');
      expect(saved.passwordHash).not.toContain('correct horse battery');
      await expect(
        bcrypt.compare('correct horse battery', saved.passwordHash),
      ).resolves.toBe(true);
    });

    // Open signup is only safe because a new account cannot spend anything.
    it('starts a new account at zero balance', async () => {
      await service.signUp({ email: 'a@b.com', password: 'a-long-password' });

      expect(accounts.save.mock.calls[0][0].balanceUsd).toBe('0.0000');
    });

    it('refuses a duplicate email', async () => {
      accounts.findOne.mockResolvedValue({ id: 1, email: 'a@b.com' });

      await expect(
        service.signUp({ email: 'A@b.com', password: 'a-long-password' }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('signing in', () => {
    const withAccount = async (overrides = {}) => {
      accounts.findOne.mockResolvedValue({
        id: 4,
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('a-long-password', 10),
        isActive: true,
        ...overrides,
      });
    };

    it('issues a token scoped to the portal audience', async () => {
      await withAccount();

      const session = await service.signIn('a@b.com', 'a-long-password');
      const payload = jwt.verify(session.token, partnerTokenSecret(), {
        audience: PARTNER_TOKEN_AUDIENCE,
      }) as jwt.JwtPayload;

      expect(Number(payload.sub)).toBe(4);
      expect(payload.aud).toBe(PARTNER_TOKEN_AUDIENCE);
    });

    // A portal session must never be spendable as a Yallery user token: the two are
    // different populations, and one of them signs up unattended.
    it('signs with a key that is not the user JWT secret', () => {
      expect(partnerTokenSecret({ JWT_SECRET: 'user-secret' } as never)).not.toBe(
        'user-secret',
      );
    });

    it('prefers an explicitly configured partner secret', () => {
      expect(
        partnerTokenSecret({ JWT_SECRET: 'u', PARTNER_JWT_SECRET: 'p' } as never),
      ).toBe('p');
    });

    it('rejects a wrong password', async () => {
      await withAccount();

      await expect(service.signIn('a@b.com', 'nope')).rejects.toMatchObject({
        status: 401,
      });
    });

    it('rejects a deactivated account', async () => {
      await withAccount({ isActive: false });

      await expect(
        service.signIn('a@b.com', 'a-long-password'),
      ).rejects.toMatchObject({ status: 401 });
    });

    // Different answers for the two cases would turn the login form into a way to find
    // out who our customers are.
    it('says the same thing for an unknown email as for a wrong password', async () => {
      await withAccount();
      const wrongPassword = await service
        .signIn('a@b.com', 'nope')
        .catch((error) => error.getResponse());

      accounts.findOne.mockResolvedValue(null);
      const unknownEmail = await service
        .signIn('nobody@b.com', 'nope')
        .catch((error) => error.getResponse());

      expect(unknownEmail).toEqual(wrongPassword);
    });
  });

  describe('keys', () => {
    it('stores only the hash and returns the plaintext once', async () => {
      const { record, plaintext } = await service.createKey(4, 'production');

      expect(plaintext).toMatch(/^ya_[0-9a-f]{48}$/);
      expect(record.keyHash).toBe(hashPartnerKey(plaintext));
      expect(JSON.stringify(record)).not.toContain(plaintext);
    });

    it('attaches the key to the account that asked for it', async () => {
      await service.createKey(4, 'production');

      expect(keys.save.mock.calls[0][0].accountId).toBe(4);
    });

    it('caps how many active keys one account can hold', async () => {
      keys.count.mockResolvedValue(10);

      await expect(service.createKey(4, 'another')).rejects.toMatchObject({
        status: 400,
      });
    });

    // Scoping the UPDATE by accountId is what stops one customer revoking another's key.
    it('revokes only within the account that asked', async () => {
      await service.revokeKey(4, 9);

      expect(keys.update).toHaveBeenCalledWith(
        { id: 9, accountId: 4 },
        { isActive: false },
      );
    });

    it('reports a key that does not belong to the account as not found', async () => {
      keys.update.mockResolvedValue({ affected: 0 });

      await expect(service.revokeKey(4, 9)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
