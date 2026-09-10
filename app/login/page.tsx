import { isDevAuthEnabled } from '@/lib/control-plane/auth-config';
import { getRequestRegionalSettings } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/catalog';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith('/') ? params.returnTo : '/';
  const loginUrl = process.env.CONTROL_PLANE_LOGIN_URL?.trim();
  const dev = isDevAuthEnabled();
  const regional = await getRequestRegionalSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(regional.locale, key);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="border border-os-border bg-os-panel p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-os-muted">{t('auth.brand')}</div>
          <LocaleSwitcher compact={false} />
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-os-text">{t('auth.title')}</h1>
        <p className="mt-2 text-sm leading-6 text-os-muted">{t('auth.description')}</p>
        {loginUrl ? (
          <a className="mt-6 block bg-os-red px-4 py-3 text-center text-sm font-semibold text-white" href={loginUrl}>
            {t('auth.continue')}
          </a>
        ) : null}
        {dev ? (
          <form className="mt-6 space-y-3 border-t border-os-border pt-6" method="post" action="/api/auth/dev-login">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input className="w-full border border-os-border bg-os-bg px-3 py-2 text-sm" name="displayName" placeholder={t('auth.devName')} />
            <input className="w-full border border-os-border bg-os-bg px-3 py-2 text-sm" name="email" type="email" placeholder={t('auth.devEmail')} required />
            <button className="w-full border border-os-border px-4 py-2 text-sm font-semibold" type="submit">
              {t('auth.devLogin')}
            </button>
          </form>
        ) : null}
        {!loginUrl && !dev ? <p className="mt-6 text-xs text-os-dim">{t('auth.providerMissing')}</p> : null}
      </div>
    </main>
  );
}
