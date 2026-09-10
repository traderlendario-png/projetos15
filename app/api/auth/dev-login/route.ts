import { NextRequest, NextResponse } from 'next/server';
import { isDevAuthEnabled, getSessionCookieSecure } from '@/lib/control-plane/auth-config';
import { resolveOrProvisionExternalIdentity } from '@/lib/control-plane/identity';
import { createUserSession } from '@/lib/control-plane/sessions';
import { safeReturnTo } from '@/lib/control-plane/identity-bridge';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/control-plane/session-token';
import { recordAccessAudit } from '@/lib/control-plane/audit';

export async function POST(req: NextRequest) {
  if (!isDevAuthEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const displayName = String(form.get('displayName') ?? '').trim() || email;
  if (!email.includes('@')) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  const identity = await resolveOrProvisionExternalIdentity({
    provider: 'dev', subject: email.toLowerCase(), email, displayName,
  });
  const created = await createUserSession({
    userId: identity.userId, identityId: identity.identityId, authMethod: 'dev', remember: true,
  });
  await recordAccessAudit({ organizationId: created.session.organization?.id ?? null, actorId: created.session.user.id, action: 'session.created', targetType: 'session', targetId: created.session.id, metadata: { authMethod: 'dev' } });
  const res = NextResponse.redirect(new URL(safeReturnTo(String(form.get('returnTo') ?? '/')), req.url), 303);
  const maxAge = Math.max(1, Math.floor((created.session.expiresAt.getTime() - Date.now()) / 1000));
  res.cookies.set(SESSION_COOKIE, created.token, sessionCookieOptions({
    secure: getSessionCookieSecure(), maxAgeSeconds: maxAge,
  }));
  return res;
}
