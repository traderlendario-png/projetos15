export const SUPPORTED_LOCALES = ['pt-BR', 'pt-PT', 'es-419', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'pt-BR';
export const LOCALE_COOKIE = 'founderos.locale';

export type RegionalSettings = {
  locale: SupportedLocale;
  country: string;
  currency: string;
  timezone: string;
  firstDayOfWeek: number;
};

export const DEFAULT_REGIONAL_SETTINGS: RegionalSettings = {
  locale: DEFAULT_LOCALE,
  country: 'BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  firstDayOfWeek: 1,
};


/** Recommended launch presets. They are suggestions only: a user may keep an
 * English UI in Brazil, a BRL workspace in English, etc. Locale and geography
 * remain independent throughout the domain model. */
export const REGION_PRESETS = {
  BR: { country: 'BR', locale: 'pt-BR', currency: 'BRL', timezone: 'America/Sao_Paulo', firstDayOfWeek: 1 },
  PT: { country: 'PT', locale: 'pt-PT', currency: 'EUR', timezone: 'Europe/Lisbon', firstDayOfWeek: 1 },
  MX: { country: 'MX', locale: 'es-419', currency: 'MXN', timezone: 'America/Mexico_City', firstDayOfWeek: 1 },
  CO: { country: 'CO', locale: 'es-419', currency: 'COP', timezone: 'America/Bogota', firstDayOfWeek: 1 },
  AR: { country: 'AR', locale: 'es-419', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires', firstDayOfWeek: 1 },
  CL: { country: 'CL', locale: 'es-419', currency: 'CLP', timezone: 'America/Santiago', firstDayOfWeek: 1 },
  PE: { country: 'PE', locale: 'es-419', currency: 'PEN', timezone: 'America/Lima', firstDayOfWeek: 1 },
  US: { country: 'US', locale: 'en-US', currency: 'USD', timezone: 'America/New_York', firstDayOfWeek: 0 },
} as const satisfies Record<string, RegionalSettings>;

export type LaunchRegionCode = keyof typeof REGION_PRESETS;

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'es-419': 'Español (Latinoamérica)',
  'en-US': 'English (United States)',
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Product locale matching deliberately collapses generic/spanish-country tags
 * into es-419 so LATAM has one stable master catalogue at launch.
 */
export function matchSupportedLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null;
  const normalized = value.trim().replace('_', '-');
  if (isSupportedLocale(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower === 'pt-pt' || lower.startsWith('pt-pt-')) return 'pt-PT';
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'es' || lower.startsWith('es-')) return 'es-419';
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
  return null;
}

export function negotiateLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  preferred?: string | null;
  fallback?: SupportedLocale;
}): SupportedLocale {
  const cookie = matchSupportedLocale(input.cookie);
  if (cookie) return cookie;

  const preferred = matchSupportedLocale(input.preferred);
  if (preferred) return preferred;

  const weighted = (input.acceptLanguage ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(';');
      const qParam = params.find((part) => part.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const entry of weighted) {
    const locale = matchSupportedLocale(entry.tag);
    if (locale) return locale;
  }
  return input.fallback ?? DEFAULT_LOCALE;
}

export function sanitizeCountry(value: string | null | undefined, fallback = DEFAULT_REGIONAL_SETTINGS.country) {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : fallback;
}

export function sanitizeCurrency(value: string | null | undefined, fallback = DEFAULT_REGIONAL_SETTINGS.currency) {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

export function sanitizeFirstDayOfWeek(value: string | number | null | undefined, fallback = DEFAULT_REGIONAL_SETTINGS.firstDayOfWeek) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : fallback;
}


export function sanitizeTimezone(
  value: string | null | undefined,
  fallback = DEFAULT_REGIONAL_SETTINGS.timezone,
): string {
  const timezone = value?.trim();
  if (!timezone) return fallback;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    return fallback;
  }
}
