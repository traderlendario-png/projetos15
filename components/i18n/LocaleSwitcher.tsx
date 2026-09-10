'use client';

import { Languages } from 'lucide-react';
import { useState } from 'react';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/i18n/locales';
import { useI18n } from './I18nProvider';

export function LocaleSwitcher({ compact = true }: { compact?: boolean }) {
  const { regional, t } = useI18n();
  const [working, setWorking] = useState(false);

  async function change(next: SupportedLocale) {
    if (next === regional.locale || working) return;
    setWorking(true);
    try {
      const response = await fetch('/api/i18n/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) throw new Error('locale_update_failed');

      // Persist for authenticated users when the Control Plane is available.
      await fetch('/api/control-plane/me/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      }).catch(() => null);
      window.location.reload();
    } finally {
      setWorking(false);
    }
  }

  return (
    <label className="relative flex items-center" title={t('topbar.locale')}>
      <Languages className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-os-dim" />
      <select
        value={regional.locale}
        disabled={working}
        onChange={(event) => void change(event.target.value as SupportedLocale)}
        aria-label={t('topbar.locale')}
        className={`h-[30px] rounded-sm-t border border-os-border bg-os-surface pl-7 text-[10px] text-os-muted outline-hidden hover:border-os-border-strong hover:text-os-text ${compact ? 'w-[92px] pr-1' : 'w-[190px] pr-2'}`}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>{compact ? locale : LOCALE_LABELS[locale]}</option>
        ))}
      </select>
    </label>
  );
}
