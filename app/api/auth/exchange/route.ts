import { NextRequest, NextResponse } from 'next/server';
import { resolveOrProvisionExternalIdentity } from '@/lib/control-plane/identity';
import {
  IdentityExchangeSchema,
  safeReturnTo,
  verifyIdentityBridgeRequest,
} from '@/lib/control-plane/identity-bridge';
import { createUserSession } from '@/lib/control-plane/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/control-plane/session-token';
import { getSessionCookieSecure } from '@/lib/control-plane/auth-config';
import { recordAccessAudit } from '@/lib/control-plane/audit';

export async function POST(req: NextRequest) {
  const secret = process.env.CONTROL_PLANE_IDENTITY_BRIDGE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'identity_bridge_not_configured' }, { status: 503 });
  const body = await req.text();
  const verified = verifyIdentityBridgeRequest({
    secret,
    timestamp: req.headers.get('x-founder-timestamp'),
    signature: req.headers.get('x-founder-signature'),
    body,
  });
  if (!verified) return NextResponse.json({ error: 'invalid_identity_bridge_signature' }, { status: 401 });

  const parsed = IdentityExchangeSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_identity_payload' }, { status: 400 });
  const identity = await resolveOrProvisionExternalIdentity(parsed.data);
  const created = await createUserSession({
    userId: identity.userId,
    identityId: identity.identityId,
    organizationId: parsed.data.organizationId ?? null,
    authMethod: parsed.data.provider,
    remember: parsed.data.remember,
  });
  await recordAccessAudit({
    organizationId: created.session.organization?.id ?? null,
    actorId: created.session.user.id,
    action: 'session.created',
    targetType: 'session',
    targetId: created.session.id,
    metadata: { authMethod: parsed.data.provider },
  });
  const res = NextResponse.json({
    ok: true,
    returnTo: safeReturnTo(parsed.data.returnTo),
    user: created.session.user,
    organization: created.session.organization,
  });
  const maxAge = Math.max(1, Math.floor((created.session.expiresAt.getTime() - Date.now()) / 1000));
  res.cookies.set(SESSION_COOKIE, created.token, sessionCookieOptions({
    secure: getSessionCookieSecure(),
    maxAgeSeconds: maxAge,
  }));
  return res;
}
