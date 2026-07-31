import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';

export const PARTNER_LINK_OUTCOMES = {
  /** Bound to this user, or already was — the caller may treat both the same. */
  LINKED: 'linked',
  PARTNERSHIP_NOT_FOUND: 'partnership_not_found',
  /** The puid belongs to a different account; never overwritten. */
  PUID_ALREADY_BOUND: 'puid_already_bound',
} as const;

export type PartnerLinkOutcome =
  (typeof PARTNER_LINK_OUTCOMES)[keyof typeof PARTNER_LINK_OUTCOMES];

/**
 * The single place a user is attached to a partnership.
 *
 * The same three-step block — resolve the partnership by referralToken, upsert
 * partner_user_links, record the `registered` activity — used to be inlined three times
 * in AuthService (register, OAuth signup, OAuth login). They had drifted apart in their
 * logging and in what they did when the puid was already taken, so an existing user who
 * signed in with a password was simply never attributed.
 *
 * Callers get an outcome rather than an exception: the auth flows must never fail a
 * login over attribution, while the HTTP endpoint maps the outcome onto status codes.
 * Once ref/puid are dropped from the auth requests, the auth-side calls delete cleanly
 * and this service keeps working unchanged for bind-partner.
 */
@Injectable()
export class PartnerLinkService {
  private readonly logger = new Logger(PartnerLinkService.name);

  constructor(
    @InjectRepository(PartnershipEntity)
    private readonly partnershipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepo: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnershipActivityRepo: Repository<PartnershipActivityEntity>,
  ) {}

  async linkPartnerUser(params: {
    ref: string;
    puid: string;
    userId: number;
  }): Promise<PartnerLinkOutcome> {
    const { ref, puid, userId } = params;

    const partnership = await this.partnershipRepo.findOne({
      where: { referralToken: ref },
    });
    if (!partnership) {
      return PARTNER_LINK_OUTCOMES.PARTNERSHIP_NOT_FOUND;
    }

    // orIgnore against the unique (partnershipId, partnerUserId) index: two concurrent
    // binds cannot both insert, and the loser falls through to the read below rather
    // than surfacing a 1062.
    const inserted = await this.partnerUserLinkRepo
      .createQueryBuilder()
      .insert()
      .into(PartnerUserLinkEntity)
      .values({ partnershipId: partnership.id, partnerUserId: puid, userId })
      .orIgnore()
      .execute();

    if (inserted.raw?.affectedRows) {
      await this.recordRegisteredActivity(partnership.id, userId);
      return PARTNER_LINK_OUTCOMES.LINKED;
    }

    const existing = await this.partnerUserLinkRepo.findOne({
      where: { partnershipId: partnership.id, partnerUserId: puid },
    });
    if (!existing) {
      // Only reachable if the row vanished between the insert and this read.
      return PARTNER_LINK_OUTCOMES.PUID_ALREADY_BOUND;
    }

    if (existing.userId === userId) {
      // Idempotent: the client re-sends this right after signup as a safety net, and
      // the activity insert is itself a no-op when the row is already there.
      await this.recordRegisteredActivity(partnership.id, userId);
      return PARTNER_LINK_OUTCOMES.LINKED;
    }

    if (existing.userId == null) {
      // The WHERE keeps a concurrent claim from being overwritten; losing it means
      // someone else took the puid, which is the already-bound case.
      const claimed = await this.partnerUserLinkRepo
        .createQueryBuilder()
        .update(PartnerUserLinkEntity)
        .set({ userId })
        .where('id = :id', { id: existing.id })
        .andWhere('userId IS NULL')
        .execute();
      if (claimed.affected) {
        await this.recordRegisteredActivity(partnership.id, userId);
        return PARTNER_LINK_OUTCOMES.LINKED;
      }
    }

    return PARTNER_LINK_OUTCOMES.PUID_ALREADY_BOUND;
  }

  /**
   * INSERT IGNORE against the unique (userId, partnershipId, activity) index, so a
   * repeat bind adds nothing. Never throws: attribution bookkeeping must not fail a
   * signup or a login.
   */
  private async recordRegisteredActivity(
    partnershipId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.partnershipActivityRepo
        .createQueryBuilder()
        .insert()
        .into(PartnershipActivityEntity)
        .values({ partnershipId, userId, activity: 'registered' })
        .orIgnore()
        .updateEntity(false)
        .execute();
    } catch (error) {
      this.logger.error(
        `Failed to record registered activity for user ${userId} on partnership ${partnershipId}`,
        error?.stack ?? error?.message ?? String(error),
      );
    }
  }
}
