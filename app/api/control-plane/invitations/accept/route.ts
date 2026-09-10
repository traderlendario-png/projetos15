import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptInvitation } from '@/lib/control-plane/invitations';
import { authorizationErrorResponse, requireRequestSession } from '@/lib/control-plane/request-auth';

const Body = z.object({ token: z.string().min(20) });

export async function POST(req: NextRequest) {
  try {
    const session = await requireRequestSession();
    const body = Body.parse(await req.json());
    const accepted = await acceptInvitation({
      session,
      token: body.token,
      requestId: req.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.json({ ok: true, ...accepted });
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
