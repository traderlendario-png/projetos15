import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { translate } from '@/lib/i18n/catalog';
import { getRequestRegionalSettings } from '@/lib/i18n/server';

export default async function AccessPendingPage() {
  const regional = await getRequestRegionalSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(regional.locale, key);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <div className="border border-os-border bg-os-panel p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-os-muted">{t('auth.brand')}</div>
          <LocaleSwitcher compact={false} />
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-os-text">{t('auth.accessPendingTitle')}</h1>
        <p className="mt-3 text-sm leading-6 text-os-muted">{t('auth.accessPendingDescription')}</p>
      </div>
    </main>
  );
}
