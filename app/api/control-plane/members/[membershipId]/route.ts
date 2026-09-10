import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setMembershipStatus, setMembershipSystemRole } from '@/lib/control-plane/members';
import { authorizationErrorResponse, requireRequestPermission } from '@/lib/control-plane/request-auth';

const Body = z.object({
  roleKey: z.enum(['owner', 'admin', 'operator', 'viewer']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).refine((value) => value.roleKey || value.status, 'roleKey or status is required');

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const session = await requireRequestPermission('members.manage');
    const { membershipId } = await params;
    const body = Body.parse(await req.json());
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const result: Record<string, unknown> = { membershipId };
    if (body.roleKey) Object.assign(result, await setMembershipSystemRole({ session, membershipId, roleKey: body.roleKey, requestId }));
    if (body.status) Object.assign(result, await setMembershipStatus({ session, membershipId, status: body.status, requestId }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
