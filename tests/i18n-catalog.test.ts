import { describe, expect, it } from 'vitest';
import { getCatalog, translate } from '@/lib/i18n/catalog';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

describe('translation catalog', () => {
  it('keeps identical keys across launch locales', () => {
    const baseline = Object.keys(getCatalog('pt-BR')).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(getCatalog(locale)).sort()).toEqual(baseline);
    }
  });

  it('interpolates named parameters without changing the key contract', () => {
    expect(translate('pt-BR', 'sidebar.systemsLive', { up: 4, total: 5 })).toContain('4/5');
    expect(translate('es-419', 'sidebar.systemsLive', { up: 4, total: 5 })).toContain('4/5');
    expect(translate('en-US', 'sidebar.systemsLive', { up: 4, total: 5 })).toContain('4/5');
  });
});
