import {
  parseAcceptLanguage,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  TRANSLATABLE_FIELDS,
} from './translation.catalog';

describe('parseAcceptLanguage', () => {
  it('parses a bare locale', () => {
    expect(parseAcceptLanguage('uk')).toBe('uk');
  });

  it('parses region tags down to the base locale', () => {
    expect(parseAcceptLanguage('uk-UA,uk;q=0.9,en;q=0.8')).toBe('uk');
    expect(parseAcceptLanguage('zh-Hans-CN')).toBe('zh');
  });

  it('falls through to the next supported entry', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9,es;q=0.8')).toBe('es');
  });

  it('returns null for unsupported or missing headers', () => {
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
    expect(parseAcceptLanguage('fr-FR')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseAcceptLanguage('UK-ua')).toBe('uk');
  });
});

describe('catalog', () => {
  it('covers the 10 app locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(isSupportedLocale('ja')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
  });

  it('never marks style prompt templates as translatable', () => {
    expect(TRANSLATABLE_FIELDS.style).toEqual(['name']);
  });
});
