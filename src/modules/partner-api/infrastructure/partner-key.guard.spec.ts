import { UnauthorizedException } from '@nestjs/common';
import { PartnerKeyGuard, hashPartnerKey } from './partner-key.guard';

const contextFor = (headers: Record<string, string>) => {
  const request: Record<string, unknown> = { headers };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
};

describe('PartnerKeyGuard', () => {
  const PLAINTEXT = 'ya_abc123';
  let repository: { findOne: jest.Mock; update: jest.Mock };
  let guard: PartnerKeyGuard;

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        keyHash: hashPartnerKey(PLAINTEXT),
        isActive: true,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    guard = new PartnerKeyGuard(repository as never);
  });

  it('accepts a bearer token', async () => {
    const { request, context } = contextFor({
      authorization: `Bearer ${PLAINTEXT}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.partnerKey).toMatchObject({ id: 3 });
  });

  it('accepts x-api-key, since integrations arrive with either', async () => {
    const { request, context } = contextFor({ 'x-api-key': PLAINTEXT });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.partnerKey).toMatchObject({ id: 3 });
  });

  it('looks the key up by hash, never by plaintext', async () => {
    const { context } = contextFor({ authorization: `Bearer ${PLAINTEXT}` });
    await guard.canActivate(context);

    const where = repository.findOne.mock.calls[0][0].where;
    expect(where.keyHash).toBe(hashPartnerKey(PLAINTEXT));
    expect(JSON.stringify(where)).not.toContain(PLAINTEXT);
  });

  it('rejects a missing key', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown key', async () => {
    repository.findOne.mockResolvedValue(null);
    const { context } = contextFor({ authorization: 'Bearer ya_nope' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked key', async () => {
    repository.findOne.mockResolvedValue({
      id: 3,
      keyHash: hashPartnerKey(PLAINTEXT),
      isActive: false,
    });
    const { context } = contextFor({ authorization: `Bearer ${PLAINTEXT}` });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets the request through when the last-used stamp fails to write', async () => {
    repository.update.mockRejectedValue(new Error('db down'));
    const { context } = contextFor({ authorization: `Bearer ${PLAINTEXT}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
