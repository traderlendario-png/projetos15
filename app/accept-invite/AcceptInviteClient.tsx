'use client';

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';

export function AcceptInviteClient({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function accept() {
    setState('working');
    setMessage('');
    try {
      const response = await fetch('/api/control-plane/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? t('invite.failed'));
      const switched = await fetch('/api/auth/switch-organization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: payload.organizationId }),
      });
      if (!switched.ok) throw new Error(t('invite.acceptedSwitchFailed'));
      window.location.assign('/');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : t('invite.unexpected'));
    }
  }

  return (
    <div className="border border-os-border bg-os-panel p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-os-muted">{t('auth.brand')}</div>
      <h1 className="mt-3 text-2xl font-semibold text-os-text">{t('invite.title')}</h1>
      <p className="mt-3 text-sm leading-6 text-os-muted">{t('invite.description')}</p>
      {state === 'error' ? <p className="mt-4 text-sm text-os-red">{message}</p> : null}
      <button
        type="button"
        onClick={accept}
        disabled={state === 'working'}
        className="mt-6 w-full bg-os-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state === 'working' ? t('invite.accepting') : t('invite.accept')}
      </button>
    </div>
  );
}
