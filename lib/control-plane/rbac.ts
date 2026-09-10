import type { PermissionKey } from './types';

export type SystemRoleKey = 'owner' | 'admin' | 'operator' | 'viewer';

export const SYSTEM_ROLE_KEYS: readonly SystemRoleKey[] = [
  'owner',
  'admin',
  'operator',
  'viewer',
] as const;

export const ROLE_PERMISSION_MATRIX: Record<SystemRoleKey, readonly PermissionKey[]> = {
  owner: [
    'app.read', 'app.write',
    'organization.read', 'organization.manage', 'members.read', 'members.manage',
    'workspaces.read', 'workspaces.manage', 'billing.read', 'billing.manage',
    'settings.read', 'settings.manage', 'agents.run', 'agents.manage',
    'knowledge.read', 'knowledge.write', 'integrations.read', 'integrations.manage',
    'approvals.read', 'approvals.decide', 'audit.read',
  ],
  admin: [
    'app.read', 'app.write',
    'organization.read', 'organization.manage', 'members.read', 'members.manage',
    'workspaces.read', 'workspaces.manage', 'billing.read',
    'settings.read', 'settings.manage', 'agents.run', 'agents.manage',
    'knowledge.read', 'knowledge.write', 'integrations.read', 'integrations.manage',
    'approvals.read', 'approvals.decide', 'audit.read',
  ],
  operator: [
    'app.read', 'app.write',
    'organization.read', 'members.read', 'workspaces.read', 'settings.read',
    'agents.run', 'knowledge.read', 'knowledge.write', 'integrations.read',
    'approvals.read', 'approvals.decide',
  ],
  viewer: [
    'app.read',
    'organization.read', 'members.read', 'workspaces.read', 'billing.read',
    'settings.read', 'knowledge.read', 'integrations.read', 'approvals.read', 'audit.read',
  ],
};

export function isSystemRoleKey(value: string): value is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(value);
}

export function permissionsForRoles(roleKeys: readonly string[]): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const key of roleKeys) {
    if (!isSystemRoleKey(key)) continue;
    for (const permission of ROLE_PERMISSION_MATRIX[key]) out.add(permission);
  }
  return out;
}

/** Role delegation is intentionally stricter than members.manage. */
export function canAssignSystemRole(actorRoles: readonly string[], targetRole: SystemRoleKey): boolean {
  if (actorRoles.includes('owner')) return true;
  if (actorRoles.includes('admin')) return targetRole === 'operator' || targetRole === 'viewer';
  return false;
}

export class AuthorizationError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NO_ACTIVE_ORGANIZATION';
  readonly status: 401 | 403;

  constructor(
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NO_ACTIVE_ORGANIZATION',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthorizationError';
    this.code = code;
    this.status = code === 'UNAUTHENTICATED' ? 401 : 403;
  }
}

export function assertPermission(
  permissions: ReadonlySet<PermissionKey>,
  permission: PermissionKey,
): void {
  if (!permissions.has(permission)) {
    throw new AuthorizationError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
