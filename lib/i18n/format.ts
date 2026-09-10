import type { RegionalSettings, SupportedLocale } from './locales';

export type FormatContext = Pick<RegionalSettings, 'locale' | 'currency' | 'timezone'>;

export function formatNumber(value: number, locale: SupportedLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCompactNumber(value: number, locale: SupportedLocale): string {
  return formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 });
}

export function formatCurrency(
  value: number,
  context: Pick<FormatContext, 'locale' | 'currency'>,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  return new Intl.NumberFormat(context.locale, {
    style: 'currency',
    currency: context.currency,
    ...options,
  }).format(value);
}

export function formatCurrencyCode(
  value: number,
  locale: SupportedLocale,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options,
  }).format(value);
}

export function formatDate(
  value: Date | string | number,
  context: Pick<FormatContext, 'locale' | 'timezone'>,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(context.locale, {
    timeZone: context.timezone,
    ...options,
  }).format(date);
}

export function formatDateUtc(
  value: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(value, { locale, timezone: 'UTC' }, options);
}

export function formatDateTime(
  value: Date | string | number,
  context: Pick<FormatContext, 'locale' | 'timezone'>,
): string {
  return formatDate(value, context, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
