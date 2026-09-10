'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translate, type MessageKey, type MessageParams } from '@/lib/i18n/catalog';
import { formatCurrency, formatCurrencyCode, formatDate, formatNumber } from '@/lib/i18n/format';
import type { RegionalSettings } from '@/lib/i18n/locales';

type I18nContextValue = {
  regional: RegionalSettings;
  t: (key: MessageKey, params?: MessageParams) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  currency: (value: number, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>) => string;
  currencyCode: (value: number, currency: string, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>) => string;
  date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ regional, children }: { regional: RegionalSettings; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => ({
    regional,
    t: (key, params) => translate(regional.locale, key, params),
    number: (number, options) => formatNumber(number, regional.locale, options),
    currency: (number, options) => formatCurrency(number, regional, options),
    currencyCode: (number, currency, options) => formatCurrencyCode(number, regional.locale, currency, options),
    date: (date, options) => formatDate(date, regional, options),
  }), [regional]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
