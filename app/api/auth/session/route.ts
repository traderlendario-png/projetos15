import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getRequestSession } from '@/lib/control-plane/request-auth';
import { revokeUserSession } from '@/lib/control-plane/sessions';
import { SESSION_COOKIE } from '@/lib/control-plane/session-token';
import { recordAccessAudit } from '@/lib/control-plane/audit';

export async function GET() {
  const session = await getRequestSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    session: {
      id: session.id,
      user: session.user,
      organization: session.organization,
      workspace: session.workspace,
      roles: session.roleKeys,
      permissions: [...session.permissions],
      expiresAt: session.expiresAt,
    },
  });
}

export async function DELETE() {
  const session = await getRequestSession();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeUserSession(token);
  if (session) {
    await recordAccessAudit({ organizationId: session.organization?.id ?? null, actorId: session.user.id, action: 'session.revoked', targetType: 'session', targetId: session.id });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
