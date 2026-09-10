import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'founder_os_session';
export const SESSION_TOKEN_BYTES = 32;

export function createOpaqueSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function sessionCookieOptions(input: {
  secure: boolean;
  maxAgeSeconds: number;
}) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: input.secure,
    path: '/',
    maxAge: input.maxAgeSeconds,
  };
}
