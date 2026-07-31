import { BranchLinkService } from 'src/modules/admin/features/partnerships/branch-link.service';

describe('BranchLinkService.withReferralToken', () => {
  const TOKEN = 'b9169ac2-6a97-41a6-9ed6-50fce931b36b';

  // Without ref in the query the app sends puid alone and the signup path declines to
  // link the user, with no error anywhere. This is the whole point of the helper.
  it('appends ref to a bare Branch link', () => {
    expect(
      BranchLinkService.withReferralToken(
        'https://cuyab.app.link/ja4ZaZtJd5b',
        TOKEN,
      ),
    ).toBe(`https://cuyab.app.link/ja4ZaZtJd5b?ref=${TOKEN}`);
  });

  it('keeps an existing query string intact', () => {
    expect(
      BranchLinkService.withReferralToken(
        'https://cuyab.app.link/ja4ZaZtJd5b?utm_source=x',
        TOKEN,
      ),
    ).toBe(`https://cuyab.app.link/ja4ZaZtJd5b?utm_source=x&ref=${TOKEN}`);
  });

  it('does not double-append when a ref is already there', () => {
    const url = `https://cuyab.app.link/ja4ZaZtJd5b?ref=${TOKEN}`;
    expect(BranchLinkService.withReferralToken(url, TOKEN)).toBe(url);
  });

  it('falls back rather than throwing on a malformed url', () => {
    expect(BranchLinkService.withReferralToken('not a url', TOKEN)).toBe(
      `not a url?ref=${TOKEN}`,
    );
    expect(BranchLinkService.withReferralToken('', TOKEN)).toBe('');
  });
});
