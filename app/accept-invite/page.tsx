import { AcceptInviteClient } from './AcceptInviteClient';
import { translate } from '@/lib/i18n/catalog';
import { getRequestRegionalSettings } from '@/lib/i18n/server';

export const metadata = { robots: { index: false, follow: false } };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const regional = await getRequestRegionalSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(regional.locale, key);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      {token ? (
        <AcceptInviteClient token={token} />
      ) : (
        <div className="border border-os-border bg-os-panel p-8 text-sm text-os-muted">{t('auth.inviteMissing')}</div>
      )}
    </main>
  );
}
