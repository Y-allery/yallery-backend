import { normalizeEmailIdentity } from './referral-reward.contract';

describe('normalizeEmailIdentity', () => {
  it('collapses "+tag" aliases on any provider', () => {
    expect(normalizeEmailIdentity('user+ref1@outlook.com')).toBe(
      'user@outlook.com',
    );
  });

  it('collapses dots only on providers that ignore them', () => {
    expect(normalizeEmailIdentity('First.Last@gmail.com')).toBe(
      'firstlast@gmail.com',
    );
    expect(normalizeEmailIdentity('first.last@googlemail.com')).toBe(
      'firstlast@gmail.com',
    );
    // Elsewhere the dot is part of the address and two people may own both.
    expect(normalizeEmailIdentity('first.last@company.com')).toBe(
      'first.last@company.com',
    );
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeEmailIdentity('  USER@Example.COM ')).toBe(
      'user@example.com',
    );
  });

  it('leaves malformed input alone instead of inventing an identity', () => {
    expect(normalizeEmailIdentity('not-an-email')).toBe('not-an-email');
    expect(normalizeEmailIdentity('@gmail.com')).toBe('@gmail.com');
  });
});
