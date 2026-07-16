/**
 * Which admin-managed entities get auto-translated and which of their text
 * fields are user-facing. Style prompt templates (positive/negative) are
 * model prompts, not UI copy — deliberately excluded.
 */

export const SUPPORTED_LOCALES = [
  'ar',
  'en',
  'es',
  'ja',
  'ko',
  'pl',
  'ru',
  'tr',
  'uk',
  'zh',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type TranslatableEntityType =
  | 'contest'
  | 'tag'
  | 'style'
  | 'meme'
  | 'reward'
  | 'color';

export const TRANSLATABLE_FIELDS: Record<TranslatableEntityType, string[]> = {
  contest: ['name', 'description', 'promptExample'],
  tag: ['name'],
  style: ['name'],
  meme: ['name'],
  reward: ['description'],
  color: ['name'],
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Parses an Accept-Language header ("uk-UA,uk;q=0.9,en;q=0.8" or just "uk")
 * into a supported locale, or null when nothing matches.
 */
export function parseAcceptLanguage(
  header: string | undefined,
): SupportedLocale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (isSupportedLocale(tag)) return tag;
    if (isSupportedLocale(base)) return base;
  }
  return null;
}
