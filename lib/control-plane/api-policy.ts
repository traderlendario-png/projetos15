import type { PermissionKey } from './types';

const PUBLIC_AUTH_PATHS = ['/login', '/access-pending', '/api/auth/exchange', '/api/auth/dev-login', '/api/i18n/locale'] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Coarse protection for legacy API routes. Sensitive Control Plane routes keep
 * stricter route-level checks; this prevents a read-only viewer from mutating
 * old FounderOS endpoints while those modules are migrated domain-by-domain.
 */
export function requiredApiPermission(input: { pathname: string; method: string }): PermissionKey | null {
  const path = input.pathname;
  if (!path.startsWith('/api/')) return null;
  if (path.startsWith('/api/auth/')) return null;
  if (path === '/api/control-plane/invitations/accept') return null;
  if (path === '/api/control-plane/me/preferences') return null;
  if (path === '/api/control-plane/invitations') return 'members.manage';
  if (/^\/api\/agents\/[^/]+\/(run|chat)$/.test(path) || path === '/api/agents/broadcast' || path === '/api/agents/work') {
    return 'agents.run';
  }
  if (path === '/api/connections/connect' || path === '/api/keys') return 'integrations.manage';
  if (path === '/api/connections' || path.startsWith('/api/control-plane/health')) return 'app.read';
  return ['GET', 'HEAD', 'OPTIONS'].includes(input.method.toUpperCase()) ? 'app.read' : 'app.write';
}
