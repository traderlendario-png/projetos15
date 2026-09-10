import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createInvitation } from '@/lib/control-plane/invitations';
import { authorizationErrorResponse, requireRequestPermission } from '@/lib/control-plane/request-auth';

const Body = z.object({
  email: z.string().email(),
  roleKey: z.enum(['owner', 'admin', 'operator', 'viewer']),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRequestPermission('members.manage');
    const body = Body.parse(await req.json());
    const invitation = await createInvitation({
      session,
      email: body.email,
      roleKey: body.roleKey,
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    // The raw token is returned exactly once. The database stores only SHA-256.
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
