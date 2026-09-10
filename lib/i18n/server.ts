import { headers } from 'next/headers';
import {
  DEFAULT_REGIONAL_SETTINGS,
  matchSupportedLocale,
  sanitizeCountry,
  sanitizeCurrency,
  sanitizeFirstDayOfWeek,
  type RegionalSettings,
} from './locales';

export const INTERNAL_LOCALE_HEADERS = {
  locale: 'x-founder-locale',
  country: 'x-founder-country',
  currency: 'x-founder-currency',
  timezone: 'x-founder-timezone',
  firstDayOfWeek: 'x-founder-first-day-of-week',
} as const;

export async function getRequestRegionalSettings(): Promise<RegionalSettings> {
  try {
    const requestHeaders = await headers();
    return {
      locale: matchSupportedLocale(requestHeaders.get(INTERNAL_LOCALE_HEADERS.locale)) ?? DEFAULT_REGIONAL_SETTINGS.locale,
      country: sanitizeCountry(requestHeaders.get(INTERNAL_LOCALE_HEADERS.country)),
      currency: sanitizeCurrency(requestHeaders.get(INTERNAL_LOCALE_HEADERS.currency)),
      timezone: requestHeaders.get(INTERNAL_LOCALE_HEADERS.timezone)?.trim() || DEFAULT_REGIONAL_SETTINGS.timezone,
      firstDayOfWeek: sanitizeFirstDayOfWeek(requestHeaders.get(INTERNAL_LOCALE_HEADERS.firstDayOfWeek)),
    };
  } catch {
    return DEFAULT_REGIONAL_SETTINGS;
  }
}
