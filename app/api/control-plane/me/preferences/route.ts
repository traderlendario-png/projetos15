import { NextRequest, NextResponse } from 'next/server';
import { authorizationErrorResponse, requireRequestSession } from '@/lib/control-plane/request-auth';
import { loadEffectiveRegionalSettings, updateUserPreferences, UserPreferencesPatchSchema } from '@/lib/control-plane/preferences';
import { getControlPlaneConnection } from '@/lib/control-plane/client';

export async function GET() {
  try {
    const session = await requireRequestSession();
    const { sql } = getControlPlaneConnection();
    const regional = await sql.begin(async (tx) => {
      await tx`select set_config('founder_os.actor_id', ${session.user.id}, true)`;
      if (session.organization) await tx`select set_config('founder_os.organization_id', ${session.organization.id}, true)`;
      return loadEffectiveRegionalSettings(tx, session.user.id, session.organization?.id ?? null);
    });
    return NextResponse.json({ regional });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRequestSession();
    const patch = UserPreferencesPatchSchema.parse(await req.json());
    const regional = await updateUserPreferences({
      session,
      patch,
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.json({ ok: true, regional });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
