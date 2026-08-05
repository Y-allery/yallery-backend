import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';

export interface PartnerRequest extends Request {
  partnerKey?: PartnerApiKeyEntity;
}

/** Swagger security scheme name for the partner key. */
export const PARTNER_API_KEY_SECURITY = 'partnerApiKey';

export const hashPartnerKey = (plaintext: string): string =>
  createHash('sha256').update(plaintext, 'utf8').digest('hex');

/**
 * Authenticates a partner by API key.
 *
 * Both header spellings are accepted because integrations arrive with whichever their
 * previous provider used, and being strict here buys nothing: `Authorization: Bearer k`
 * and `x-api-key: k` are the same secret either way.
 */
@Injectable()
export class PartnerKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(PartnerApiKeyEntity)
    private readonly keyRepository: Repository<PartnerApiKeyEntity>,
  ) {}

  private extract(request: {
    headers: Record<string, unknown>;
  }): string | null {
    const header = (name: string) => {
      const value = request.headers[name];
      return typeof value === 'string' ? value.trim() : '';
    };
    const bearer = header('authorization');
    if (bearer.toLowerCase().startsWith('bearer ')) {
      return bearer.slice(7).trim() || null;
    }
    return header('x-api-key') || null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const presented = this.extract(request);
    if (!presented) {
      throw new UnauthorizedException({
        error: { type: 'authentication_error', message: 'Missing API key' },
      });
    }

    const record = await this.keyRepository.findOne({
      where: { keyHash: hashPartnerKey(presented) },
    });
    // Compared after the lookup as well: the hash is the index, but an attacker who can
    // provoke a collision should still not pass on a partial match.
    const matches =
      record != null &&
      timingSafeEqual(
        Buffer.from(record.keyHash, 'hex'),
        Buffer.from(hashPartnerKey(presented), 'hex'),
      );

    if (!matches || !record.isActive) {
      throw new UnauthorizedException({
        error: { type: 'authentication_error', message: 'Invalid API key' },
      });
    }

    request.partnerKey = record;
    // Fire-and-forget: a last-seen timestamp must never fail a generation.
    this.keyRepository
      .update({ id: record.id }, { lastUsedAt: new Date() })
      .catch(() => undefined);
    return true;
  }
}
