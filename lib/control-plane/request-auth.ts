import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getControlPlaneAuthMode } from './auth-config';
import { AuthorizationError } from './rbac';
import { SESSION_COOKIE } from './session-token';
import { resolveUserSession, requireSessionPermission, type AuthenticatedSession } from './sessions';
import type { PermissionKey } from './types';

export async function getRequestSession(): Promise<AuthenticatedSession | null> {
  if (getControlPlaneAuthMode() === 'disabled') return null;
  const store = await cookies();
  return resolveUserSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireRequestSession(): Promise<AuthenticatedSession> {
  const session = await getRequestSession();
  if (!session) throw new AuthorizationError('UNAUTHENTICATED');
  return session;
}

export async function requireRequestPermission(permission: PermissionKey) {
  return requireSessionPermission(await requireRequestSession(), permission);
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  return null;
}
