'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { DEFAULT_THEME, resolveInitialTheme, THEME_META, THEME_STORAGE_KEY, THEMES, type Theme } from '@/lib/theme';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/catalog';

const THEME_I18N: Record<Theme, { name: MessageKey; blurb: MessageKey }> = {
  dark: { name: 'theme.dark.name', blurb: 'theme.dark.blurb' },
  light: { name: 'theme.light.name', blurb: 'theme.light.blurb' },
  midnight: { name: 'theme.midnight.name', blurb: 'theme.midnight.blurb' },
  ember: { name: 'theme.ember.name', blurb: 'theme.ember.blurb' },
  mono: { name: 'theme.mono.name', blurb: 'theme.mono.blurb' },
  'mono-light': { name: 'theme.monoLight.name', blurb: 'theme.monoLight.blurb' },
};

/**
 * Theme picker: a palette chip in the topbar that opens the theme menu —
 * every registered skin with its swatch trio, name and one-line feel. Picking
 * one flips `data-theme` on <html> (re-pointing every os.* CSS var) and
 * persists the choice; the pre-paint init script in layout.tsx applies it on
 * the next load, so this only reads the attribute back and keeps it in sync.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTheme(resolveInitialTheme(document.documentElement.getAttribute('data-theme')));
  }, []);

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function apply(next: Theme) {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — the in-session swap still works */
    }
    setTheme(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('theme.heading')}
        aria-label={t('theme.heading')}
        aria-expanded={open}
        className="grid h-[30px] w-[30px] place-items-center rounded-sm-t border border-os-border bg-os-surface text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
      >
        <Palette className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-sm-t border border-os-border-strong bg-os-surface p-1 shadow-lg">
          <div className="px-2 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">{t('theme.heading')}</div>
          {THEMES.map((themeOption) => {
            const meta = THEME_META[themeOption];
            const labels = THEME_I18N[themeOption];
            const active = themeOption === theme;
            return (
              <button
                key={themeOption}
                onClick={() => apply(themeOption)}
                className={`flex w-full items-center gap-2.5 rounded-sm-t px-2 py-1.5 text-left transition-colors ${
                  active ? 'bg-os-surface-2' : 'hover:bg-os-surface-2'
                }`}
              >
                <span className="flex shrink-0 -space-x-1">
                  {meta.swatch.map((c, i) => (
                    <span
                      key={i}
                      className="h-3.5 w-3.5 rounded-full border border-os-border-strong"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold leading-tight">{t(labels.name)}</span>
                  <span className="block truncate font-mono text-[9px] text-os-dim">{t(labels.blurb)}</span>
                </span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-os-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
