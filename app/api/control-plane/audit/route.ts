import { NextRequest, NextResponse } from 'next/server';
import { requireRequestPermission, authorizationErrorResponse } from '@/lib/control-plane/request-auth';
import { withControlPlaneScope } from '@/lib/control-plane/scope';

export async function GET(req: NextRequest) {
  try {
    const session = await requireRequestPermission('audit.read');
    const organizationId = session.organization!.id;
    const requested = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
    const limit = Math.min(250, Math.max(1, Number.isFinite(requested) ? requested : 100));
    const events = await withControlPlaneScope(
      { organizationId, actorId: session.user.id, requestId: req.headers.get('x-request-id') ?? undefined },
      async (tx) => tx<{
        id: string;
        actor_id: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        request_id: string | null;
        outcome: string;
        metadata: Record<string, unknown>;
        occurred_at: Date;
      }[]>`
        SELECT id, actor_id, action, target_type, target_id, request_id, outcome, metadata, occurred_at
        FROM control_plane.access_audit_log
        WHERE organization_id = ${organizationId}
        ORDER BY occurred_at DESC
        LIMIT ${limit}
      `,
    );
    return NextResponse.json({ events });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
