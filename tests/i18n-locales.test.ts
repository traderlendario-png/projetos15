import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REGIONAL_SETTINGS,
  REGION_PRESETS,
  matchSupportedLocale,
  negotiateLocale,
  sanitizeTimezone,
} from '@/lib/i18n/locales';

describe('global locale contract', () => {
  it('collapses country-specific Spanish into the LATAM master catalog', () => {
    expect(matchSupportedLocale('es-MX')).toBe('es-419');
    expect(matchSupportedLocale('es-CO')).toBe('es-419');
    expect(matchSupportedLocale('es-AR')).toBe('es-419');
  });

  it('keeps Portugal distinct while generic Portuguese falls back to Brazil', () => {
    expect(matchSupportedLocale('pt-PT')).toBe('pt-PT');
    expect(matchSupportedLocale('pt')).toBe('pt-BR');
    expect(matchSupportedLocale('pt-AO')).toBe('pt-BR');
  });

  it('respects cookie, then preferred setting, then weighted browser language', () => {
    expect(negotiateLocale({ cookie: 'en-US', preferred: 'pt-BR', acceptLanguage: 'es-MX' })).toBe('en-US');
    expect(negotiateLocale({ preferred: 'pt-PT', acceptLanguage: 'es-MX' })).toBe('pt-PT');
    expect(negotiateLocale({ acceptLanguage: 'en-GB;q=0.4, es-MX;q=0.9' })).toBe('es-419');
  });

  it('ships launch presets without coupling UI language to geography', () => {
    expect(REGION_PRESETS.BR.currency).toBe('BRL');
    expect(REGION_PRESETS.MX.locale).toBe('es-419');
    expect(REGION_PRESETS.PT.locale).toBe('pt-PT');
    expect(REGION_PRESETS.US.currency).toBe('USD');
  });

  it('rejects invalid IANA zones through the sanitizer', () => {
    expect(sanitizeTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(sanitizeTimezone('not/a-zone')).toBe(DEFAULT_REGIONAL_SETTINGS.timezone);
  });
});
