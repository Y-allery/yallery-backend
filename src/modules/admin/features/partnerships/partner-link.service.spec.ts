import { PartnerLinkService } from './partner-link.service';

/**
 * This is the one place a user gets attached to a partnership, shared by register, the
 * two OAuth paths and POST /user/bind-partner. The contract the client depends on is the
 * outcome: it clears the stored ref/puid on a terminal one and retries otherwise.
 */
describe('PartnerLinkService.linkPartnerUser', () => {
  const createService = ({
    partnership = { id: 19 },
    insertedRows = 1,
    existingLink = null as any,
    claimAffected = 1,
  }: any = {}) => {
    const linkInsertQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: { affectedRows: insertedRows } })),
    };
    const claimQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: claimAffected })),
    };
    const partnerUserLinkRepo = {
      createQueryBuilder: jest.fn(() =>
        linkInsertQb.execute.mock.calls.length ? claimQb : linkInsertQb,
      ),
      findOne: jest.fn(async () => existingLink),
    };

    const activityQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: { affectedRows: 1 } })),
    };
    const partnershipActivityRepo = {
      createQueryBuilder: jest.fn(() => activityQb),
    };
    const partnershipRepo = { findOne: jest.fn(async () => partnership) };

    return {
      service: new PartnerLinkService(
        partnershipRepo as any,
        partnerUserLinkRepo as any,
        partnershipActivityRepo as any,
      ),
      partnershipRepo,
      partnerUserLinkRepo,
      activityQb,
      claimQb,
    };
  };

  it('links a fresh puid and records the registered activity', async () => {
    const { service, activityQb } = createService();

    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('linked');

    expect(activityQb.values).toHaveBeenCalledWith({
      partnershipId: 19,
      userId: 42,
      activity: 'registered',
    });
    // INSERT IGNORE against the unique index, so a repeat bind adds nothing.
    expect(activityQb.orIgnore).toHaveBeenCalled();
  });

  it('reports partnership_not_found for an unknown ref', async () => {
    const { service } = createService({ partnership: null });

    await expect(
      service.linkPartnerUser({ ref: 'nope', puid: 'p1', userId: 42 }),
    ).resolves.toBe('partnership_not_found');
  });

  // The client re-sends this right after signup as a safety net.
  it('is idempotent when the pair is already bound to the same user', async () => {
    const { service } = createService({
      insertedRows: 0,
      existingLink: { id: 5, userId: 42 },
    });

    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('linked');
  });

  it('refuses to steal a puid bound to somebody else', async () => {
    const { service, claimQb } = createService({
      insertedRows: 0,
      existingLink: { id: 5, userId: 999 },
    });

    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('puid_already_bound');
    // Nothing is overwritten.
    expect(claimQb.execute).not.toHaveBeenCalled();
  });

  it('adopts a link that was created without a user', async () => {
    const { service } = createService({
      insertedRows: 0,
      existingLink: { id: 5, userId: null },
    });

    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('linked');
  });

  it('treats losing the race for an unbound link as already bound', async () => {
    const { service } = createService({
      insertedRows: 0,
      existingLink: { id: 5, userId: null },
      claimAffected: 0,
    });

    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('puid_already_bound');
  });

  it('never fails the caller when the activity insert throws', async () => {
    const { service, activityQb } = createService();
    activityQb.execute.mockRejectedValue(new Error('db down'));

    // A signup or a login must not break over attribution bookkeeping.
    await expect(
      service.linkPartnerUser({ ref: 'token', puid: 'p1', userId: 42 }),
    ).resolves.toBe('linked');
  });
});
