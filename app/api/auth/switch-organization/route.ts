import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authorizationErrorResponse } from '@/lib/control-plane/request-auth';
import { SESSION_COOKIE } from '@/lib/control-plane/session-token';
import { switchSessionOrganization } from '@/lib/control-plane/sessions';
import { recordAccessAudit } from '@/lib/control-plane/audit';

const Body = z.object({ organizationId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.parse(await req.json());
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const session = await switchSessionOrganization(token, parsed.organizationId);
    await recordAccessAudit({ organizationId: session.organization?.id ?? null, actorId: session.user.id, action: 'session.organization_switched', targetType: 'organization', targetId: parsed.organizationId, requestId: req.headers.get('x-request-id') ?? undefined });
    return NextResponse.json({ ok: true, organization: session.organization, workspace: session.workspace });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
