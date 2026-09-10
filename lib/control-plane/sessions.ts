import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { createOpaqueSessionToken, hashOpaqueToken } from './session-token';
import { AuthorizationError, assertPermission } from './rbac';
import type { PermissionKey } from './types';
import { loadEffectiveRegionalSettings } from './preferences';
import type { RegionalSettings } from '@/lib/i18n/locales';

export type AuthenticatedSession = {
  id: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
  } | null;
  membershipId: string | null;
  roleKeys: string[];
  permissions: Set<PermissionKey>;
  workspace: {
    id: string;
    slug: string;
    displayName: string;
    engineTenantId: string;
    engineOrganizationId: string | null;
    engineWorkspaceId: string;
  } | null;
  regional: RegionalSettings;
  expiresAt: Date;
};

export type CreatedSession = {
  token: string;
  session: AuthenticatedSession;
};

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
const REMEMBER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type WorkspaceRow = {
  id: string;
  slug: string;
  display_name: string;
  engine_tenant_id: string;
  engine_organization_id: string | null;
  engine_workspace_id: string;
};

async function defaultWorkspace(tx: postgres.TransactionSql, organizationId: string): Promise<WorkspaceRow | null> {
  const rows = await tx<WorkspaceRow[]>`
    SELECT id, slug, display_name, engine_tenant_id, engine_organization_id, engine_workspace_id
    FROM control_plane.workspace_bindings
    WHERE organization_id = ${organizationId} AND status = 'active'
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadAccessContext(tx: postgres.TransactionSql, input: {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  organizationId: string | null;
  workspaceBindingId: string | null;
  expiresAt: Date;
}): Promise<AuthenticatedSession> {
  const regional = await loadEffectiveRegionalSettings(tx, input.userId, input.organizationId);
  if (!input.organizationId) {
    return {
      id: input.sessionId,
      user: { id: input.userId, email: input.email, displayName: input.displayName },
      organization: null,
      membershipId: null,
      roleKeys: [],
      permissions: new Set<PermissionKey>(),
      workspace: null,
      regional,
      expiresAt: input.expiresAt,
    };
  }

  await tx`select set_config('founder_os.organization_id', ${input.organizationId}, true)`;
  await tx`select set_config('founder_os.actor_id', ${input.userId}, true)`;

  const memberships = await tx<{
    membership_id: string;
    organization_id: string;
    organization_slug: string;
    organization_name: string;
  }[]>`
    SELECT m.id AS membership_id, o.id AS organization_id,
           o.slug AS organization_slug, o.name AS organization_name
    FROM control_plane.memberships m
    JOIN control_plane.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = ${input.organizationId}
      AND m.user_id = ${input.userId}
      AND m.status = 'active'
      AND o.status = 'active'
    LIMIT 1
  `;
  const membership = memberships[0];
  if (!membership) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');

  const roleRows = await tx<{ role_key: string }[]>`
    SELECT DISTINCT r.key AS role_key
    FROM control_plane.membership_roles mr
    JOIN control_plane.roles r
      ON r.id = mr.role_id AND r.organization_id = mr.organization_id
    WHERE mr.organization_id = ${input.organizationId}
      AND mr.membership_id = ${membership.membership_id}
    ORDER BY r.key
  `;
  const permissionRows = await tx<{ permission_key: PermissionKey }[]>`
    SELECT DISTINCT rp.permission_key
    FROM control_plane.membership_roles mr
    JOIN control_plane.role_permissions rp
      ON rp.role_id = mr.role_id AND rp.organization_id = mr.organization_id
    WHERE mr.organization_id = ${input.organizationId}
      AND mr.membership_id = ${membership.membership_id}
    ORDER BY rp.permission_key
  `;

  let workspace = null as AuthenticatedSession['workspace'];
  let workspaceRow: WorkspaceRow | null = null;
  if (input.workspaceBindingId) {
    const rows = await tx<WorkspaceRow[]>`
      SELECT id, slug, display_name, engine_tenant_id, engine_organization_id, engine_workspace_id
      FROM control_plane.workspace_bindings
      WHERE id = ${input.workspaceBindingId}
        AND organization_id = ${input.organizationId}
        AND status = 'active'
      LIMIT 1
    `;
    workspaceRow = rows[0] ?? null;
  }
  if (!workspaceRow) workspaceRow = await defaultWorkspace(tx, input.organizationId);
  if (workspaceRow) {
    workspace = {
      id: workspaceRow.id,
      slug: workspaceRow.slug,
      displayName: workspaceRow.display_name,
      engineTenantId: workspaceRow.engine_tenant_id,
      engineOrganizationId: workspaceRow.engine_organization_id,
      engineWorkspaceId: workspaceRow.engine_workspace_id,
    };
  }

  return {
    id: input.sessionId,
    user: { id: input.userId, email: input.email, displayName: input.displayName },
    organization: {
      id: membership.organization_id,
      slug: membership.organization_slug,
      name: membership.organization_name,
    },
    membershipId: membership.membership_id,
    roleKeys: roleRows.map((row) => row.role_key),
    permissions: new Set(permissionRows.map((row) => row.permission_key)),
    workspace,
    regional,
    expiresAt: input.expiresAt,
  };
}

export async function createUserSession(input: {
  userId: string;
  identityId?: string | null;
  organizationId?: string | null;
  authMethod?: string;
  remember?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<CreatedSession> {
  const { sql } = getControlPlaneConnection();
  const token = createOpaqueSessionToken();
  const tokenHash = hashOpaqueToken(token);
  const sessionId = randomUUID();
  const ttlSeconds = input.remember ? REMEMBER_SESSION_TTL_SECONDS : DEFAULT_SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const session = await sql.begin(async (tx) => {
    await tx`select set_config('founder_os.actor_id', ${input.userId}, true)`;
    let organizationId = input.organizationId ?? null;
    if (!organizationId) {
      const orgs = await tx<{ id: string }[]>`
        SELECT o.id
        FROM control_plane.memberships m
        JOIN control_plane.organizations o ON o.id = m.organization_id
        WHERE m.user_id = ${input.userId}
          AND m.status = 'active'
          AND o.status = 'active'
        ORDER BY o.name ASC
        LIMIT 1
      `;
      organizationId = orgs[0]?.id ?? null;
    }

    let workspace: WorkspaceRow | null = null;
    if (organizationId) {
      await tx`select set_config('founder_os.organization_id', ${organizationId}, true)`;
      const membership = await tx<{ id: string }[]>`
        SELECT id FROM control_plane.memberships
        WHERE organization_id = ${organizationId}
          AND user_id = ${input.userId}
          AND status = 'active'
        LIMIT 1
      `;
      if (!membership[0]) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');
      workspace = await defaultWorkspace(tx, organizationId);
    }

    const users = await tx<{ email: string; display_name: string }[]>`
      SELECT email, display_name FROM control_plane.users WHERE id = ${input.userId} LIMIT 1
    `;
    if (!users[0]) throw new AuthorizationError('UNAUTHENTICATED');

    await tx`
      INSERT INTO control_plane.user_sessions (
        id, user_id, identity_id, token_hash, active_organization_id,
        active_workspace_binding_id, auth_method, expires_at, metadata
      ) VALUES (
        ${sessionId}, ${input.userId}, ${input.identityId ?? null}, ${tokenHash},
        ${organizationId}, ${workspace?.id ?? null}, ${input.authMethod ?? 'external'},
        ${expiresAt}, ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;

    return loadAccessContext(tx, {
      sessionId,
      userId: input.userId,
      email: users[0].email,
      displayName: users[0].display_name,
      organizationId,
      workspaceBindingId: workspace?.id ?? null,
      expiresAt,
    });
  });

  return { token, session };
}

export async function resolveUserSession(token: string | null | undefined): Promise<AuthenticatedSession | null> {
  if (!token) return null;
  const tokenHash = hashOpaqueToken(token);
  const { sql } = getControlPlaneConnection();

  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.session_token_hash', ${tokenHash}, true)`;
    const rows = await tx<{
      id: string;
      user_id: string;
      active_organization_id: string | null;
      active_workspace_binding_id: string | null;
      expires_at: Date;
    }[]>`
      SELECT id, user_id, active_organization_id, active_workspace_binding_id, expires_at
      FROM control_plane.user_sessions
      WHERE token_hash = ${tokenHash}
        AND revoked_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    // The token-hash RLS path identifies the session first. Only then do we
    // install actor/org scope and read the protected user directory.
    await tx`select set_config('founder_os.actor_id', ${row.user_id}, true)`;
    if (row.active_organization_id) {
      await tx`select set_config('founder_os.organization_id', ${row.active_organization_id}, true)`;
    }
    const users = await tx<{ email: string; display_name: string; status: string }[]>`
      SELECT email, display_name, status
      FROM control_plane.users
      WHERE id = ${row.user_id}
      LIMIT 1
    `;
    if (!users[0] || users[0].status !== 'active') return null;
    await tx`
      UPDATE control_plane.user_sessions
      SET last_seen_at = now()
      WHERE id = ${row.id}
        AND last_seen_at < now() - interval '5 minutes'
    `;

    return loadAccessContext(tx, {
      sessionId: row.id,
      userId: row.user_id,
      email: users[0].email,
      displayName: users[0].display_name,
      organizationId: row.active_organization_id,
      workspaceBindingId: row.active_workspace_binding_id,
      expiresAt: row.expires_at,
    });
  });
}

export async function revokeUserSession(token: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const { sql } = getControlPlaneConnection();
  await sql.begin(async (tx) => {
    await tx`select set_config('founder_os.session_token_hash', ${tokenHash}, true)`;
    const rows = await tx<{ user_id: string }[]>`
      SELECT user_id FROM control_plane.user_sessions WHERE token_hash = ${tokenHash} LIMIT 1
    `;
    if (!rows[0]) return;
    await tx`select set_config('founder_os.actor_id', ${rows[0].user_id}, true)`;
    await tx`UPDATE control_plane.user_sessions SET revoked_at = now() WHERE token_hash = ${tokenHash}`;
  });
}

export async function switchSessionOrganization(token: string, organizationId: string): Promise<AuthenticatedSession> {
  const current = await resolveUserSession(token);
  if (!current) throw new AuthorizationError('UNAUTHENTICATED');
  const tokenHash = hashOpaqueToken(token);
  const { sql } = getControlPlaneConnection();

  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.session_token_hash', ${tokenHash}, true)`;
    await tx`select set_config('founder_os.actor_id', ${current.user.id}, true)`;
    await tx`select set_config('founder_os.organization_id', ${organizationId}, true)`;
    const memberships = await tx<{ id: string }[]>`
      SELECT id FROM control_plane.memberships
      WHERE organization_id = ${organizationId}
        AND user_id = ${current.user.id}
        AND status = 'active'
      LIMIT 1
    `;
    if (!memberships[0]) throw new AuthorizationError('FORBIDDEN', 'Not a member of organization');
    const workspace = await defaultWorkspace(tx, organizationId);
    await tx`
      UPDATE control_plane.user_sessions
      SET active_organization_id = ${organizationId},
          active_workspace_binding_id = ${workspace?.id ?? null}
      WHERE id = ${current.id}
    `;
    return loadAccessContext(tx, {
      sessionId: current.id,
      userId: current.user.id,
      email: current.user.email,
      displayName: current.user.displayName,
      organizationId,
      workspaceBindingId: workspace?.id ?? null,
      expiresAt: current.expiresAt,
    });
  });
}

export async function switchSessionWorkspace(token: string, workspaceBindingId: string): Promise<AuthenticatedSession> {
  const current = await resolveUserSession(token);
  if (!current) throw new AuthorizationError('UNAUTHENTICATED');
  if (!current.organization) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');
  const tokenHash = hashOpaqueToken(token);
  const { sql } = getControlPlaneConnection();

  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.session_token_hash', ${tokenHash}, true)`;
    await tx`select set_config('founder_os.actor_id', ${current.user.id}, true)`;
    await tx`select set_config('founder_os.organization_id', ${current.organization!.id}, true)`;
    const rows = await tx<{ id: string }[]>`
      SELECT id FROM control_plane.workspace_bindings
      WHERE id = ${workspaceBindingId}
        AND organization_id = ${current.organization!.id}
        AND status = 'active'
      LIMIT 1
    `;
    if (!rows[0]) throw new AuthorizationError('FORBIDDEN', 'Workspace is not available');
    await tx`
      UPDATE control_plane.user_sessions
      SET active_workspace_binding_id = ${workspaceBindingId}
      WHERE id = ${current.id}
    `;
    return loadAccessContext(tx, {
      sessionId: current.id,
      userId: current.user.id,
      email: current.user.email,
      displayName: current.user.displayName,
      organizationId: current.organization!.id,
      workspaceBindingId,
      expiresAt: current.expiresAt,
    });
  });
}

export function requireSessionPermission(session: AuthenticatedSession, permission: PermissionKey) {
  if (!session.organization) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');
  assertPermission(session.permissions, permission);
  return session;
}
