import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { PartnerAccountEntity } from '../entities/partner-account.entity';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';
import { hashPartnerKey } from '../infrastructure/partner-key.guard';

const BCRYPT_ROUNDS = 10;
const SESSION_TTL = '30d';
const MAX_ACTIVE_KEYS = 10;

/** Distinguishes a portal session from every other token this backend issues. */
export const PARTNER_TOKEN_AUDIENCE = 'yallery-partner-portal';

/**
 * Signing key for portal sessions.
 *
 * Derived from JWT_SECRET rather than reusing it, so a portal token can never be presented
 * as a user token and vice versa — a partner is not a Yallery user and must not be able to
 * become one by swapping a header. A dedicated PARTNER_JWT_SECRET overrides it.
 */
export function partnerTokenSecret(env = process.env): string {
  const dedicated = env.PARTNER_JWT_SECRET;
  if (dedicated) return dedicated;
  return createHmac('sha256', env.JWT_SECRET || 'dev')
    .update(PARTNER_TOKEN_AUDIENCE)
    .digest('hex');
}

export interface PartnerSession {
  token: string;
  accountId: number;
  email: string;
}

const invalid = (message: string, status = HttpStatus.BAD_REQUEST) =>
  new HttpException(
    { error: { type: 'invalid_request_error', message } },
    status,
  );

@Injectable()
export class PartnerAccountService {
  constructor(
    @InjectRepository(PartnerAccountEntity)
    private readonly accounts: Repository<PartnerAccountEntity>,
    @InjectRepository(PartnerApiKeyEntity)
    private readonly keys: Repository<PartnerApiKeyEntity>,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private issue(account: PartnerAccountEntity): PartnerSession {
    const token = jwt.sign(
      { sub: account.id, email: account.email },
      partnerTokenSecret(),
      { expiresIn: SESSION_TTL, audience: PARTNER_TOKEN_AUDIENCE },
    );
    return { token, accountId: account.id, email: account.email };
  }

  async signUp(input: {
    email: string;
    password: string;
    company?: string;
  }): Promise<PartnerSession> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.accounts.findOne({ where: { email } });
    if (existing) {
      throw invalid(
        'An account with this email already exists. Sign in instead.',
      );
    }

    const account = await this.accounts.save(
      this.accounts.create({
        email,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        company: input.company?.trim() || null,
        // Signup is open, and a new account starts empty: anyone may register, nobody can
        // spend until we credit them. That is what makes open signup safe here.
        balanceUsd: '0.0000',
        isActive: true,
      }),
    );
    return this.issue(account);
  }

  async signIn(email: string, password: string): Promise<PartnerSession> {
    const account = await this.accounts.findOne({
      where: { email: this.normalizeEmail(email) },
    });

    // One message for both branches: a different answer for "no such email" turns the
    // login form into a way to enumerate our customers.
    const ok =
      account != null &&
      account.isActive &&
      (await bcrypt.compare(password, account.passwordHash));
    if (!ok) {
      throw new HttpException(
        {
          error: {
            type: 'authentication_error',
            message: 'Wrong email or password.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.accounts.update({ id: account.id }, { lastLoginAt: new Date() });
    return this.issue(account);
  }

  async changePassword(
    accountId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (
      !account ||
      !(await bcrypt.compare(currentPassword, account.passwordHash))
    ) {
      throw new HttpException(
        {
          error: {
            type: 'authentication_error',
            message: 'Current password is wrong.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.accounts.update(
      { id: accountId },
      { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    );
  }

  async findById(accountId: number): Promise<PartnerAccountEntity | null> {
    return this.accounts.findOne({ where: { id: accountId } });
  }

  async listKeys(accountId: number): Promise<PartnerApiKeyEntity[]> {
    return this.keys.find({
      where: { accountId },
      order: { id: 'DESC' },
    });
  }

  /**
   * Mints a key for an account. The plaintext exists only in this return value.
   */
  async createKey(
    accountId: number,
    name: string,
  ): Promise<{ record: PartnerApiKeyEntity; plaintext: string }> {
    const active = await this.keys.count({
      where: { accountId, isActive: true },
    });
    if (active >= MAX_ACTIVE_KEYS) {
      throw invalid(
        `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one to create another.`,
      );
    }

    const plaintext = `ya_${randomBytes(24).toString('hex')}`;
    const record = await this.keys.save(
      this.keys.create({
        accountId,
        name: name.trim() || 'API key',
        keyHash: hashPartnerKey(plaintext),
        keyPrefix: plaintext.slice(0, 11),
        isActive: true,
        rateLimitPerMinute: null,
        expiresAt: null,
      }),
    );
    return { record, plaintext };
  }

  async revokeKey(accountId: number, keyId: number): Promise<void> {
    // Scoped by accountId, so a partner can only ever revoke their own key.
    const result = await this.keys.update(
      { id: keyId, accountId },
      { isActive: false },
    );
    if (!result.affected) {
      throw invalid('No such key on this account.', HttpStatus.NOT_FOUND);
    }
  }
}
