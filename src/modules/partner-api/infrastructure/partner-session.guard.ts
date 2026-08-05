import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import {
  PARTNER_TOKEN_AUDIENCE,
  partnerTokenSecret,
} from '../application/partner-account.service';
import { PartnerAccountEntity } from '../entities/partner-account.entity';

export interface PartnerPortalRequest {
  headers: Record<string, unknown>;
  partnerAccount?: PartnerAccountEntity;
}

/**
 * Authenticates a portal session.
 *
 * The account is loaded on every request rather than trusted from the token, so a
 * deactivated account stops working immediately instead of when its 30-day token expires.
 */
@Injectable()
export class PartnerSessionGuard implements CanActivate {
  constructor(
    @InjectRepository(PartnerAccountEntity)
    private readonly accounts: Repository<PartnerAccountEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers?.authorization;
    const token =
      typeof header === 'string' && /^bearer /i.test(header)
        ? header.slice(7).trim()
        : null;

    if (!token) {
      throw new UnauthorizedException({
        error: { type: 'authentication_error', message: 'Sign in first.' },
      });
    }

    let accountId: number;
    try {
      // The audience is verified, not merely present: it is what stops a Yallery user
      // token from being spent here, and vice versa.
      const payload = jwt.verify(token, partnerTokenSecret(), {
        audience: PARTNER_TOKEN_AUDIENCE,
      });
      accountId = Number(typeof payload === 'object' ? payload.sub : NaN);
    } catch {
      throw new UnauthorizedException({
        error: {
          type: 'authentication_error',
          message: 'Session expired. Sign in again.',
        },
      });
    }

    const account = Number.isFinite(accountId)
      ? await this.accounts.findOne({ where: { id: accountId } })
      : null;
    if (!account || !account.isActive) {
      throw new UnauthorizedException({
        error: { type: 'authentication_error', message: 'Account unavailable.' },
      });
    }

    request.partnerAccount = account;
    return true;
  }
}
