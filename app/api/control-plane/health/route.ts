import { NextResponse } from 'next/server';
import { getControlPlaneHealth } from '@/lib/control-plane/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getControlPlaneHealth();
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
