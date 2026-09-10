import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { AuthorizationError, canAssignSystemRole, isSystemRoleKey } from './rbac';
import type { AuthenticatedSession } from './sessions';

function requireMemberManager(session: AuthenticatedSession) {
  if (!session.organization || !session.membershipId) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');
  if (!session.permissions.has('members.manage')) throw new AuthorizationError('FORBIDDEN');
  return session.organization.id;
}

export async function setMembershipSystemRole(input: {
  session: AuthenticatedSession;
  membershipId: string;
  roleKey: string;
  requestId?: string;
}) {
  const organizationId = requireMemberManager(input.session);
  if (!isSystemRoleKey(input.roleKey)) throw new Error('Invalid role');
  if (!canAssignSystemRole(input.session.roleKeys, input.roleKey)) {
    throw new AuthorizationError('FORBIDDEN', `Cannot assign role: ${input.roleKey}`);
  }

  const { sql } = getControlPlaneConnection();
  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.organization_id', ${organizationId}, true)`;
    await tx`select set_config('founder_os.actor_id', ${input.session.user.id}, true)`;
    if (input.requestId) await tx`select set_config('founder_os.request_id', ${input.requestId}, true)`;

    const target = await tx<{ user_id: string; role_key: string | null }[]>`
      SELECT m.user_id, r.key AS role_key
      FROM control_plane.memberships m
      LEFT JOIN control_plane.membership_roles mr
        ON mr.membership_id = m.id AND mr.organization_id = m.organization_id
      LEFT JOIN control_plane.roles r
        ON r.id = mr.role_id AND r.organization_id = mr.organization_id AND r.is_system = true
      WHERE m.id = ${input.membershipId}
        AND m.organization_id = ${organizationId}
      ORDER BY CASE WHEN r.key = 'owner' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    if (!target[0]) throw new AuthorizationError('FORBIDDEN', 'Membership is unavailable');
    if (!input.session.roleKeys.includes('owner') && ['owner', 'admin'].includes(target[0].role_key ?? '')) {
      throw new AuthorizationError('FORBIDDEN', 'Only an owner can change owner/admin memberships');
    }

    if (target[0].role_key === 'owner' && input.roleKey !== 'owner') {
      const owners = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM control_plane.membership_roles mr
        JOIN control_plane.roles r
          ON r.id = mr.role_id AND r.organization_id = mr.organization_id
        JOIN control_plane.memberships m
          ON m.id = mr.membership_id AND m.organization_id = mr.organization_id
        WHERE mr.organization_id = ${organizationId}
          AND r.key = 'owner'
          AND m.status = 'active'
      `;
      if ((owners[0]?.count ?? 0) <= 1) {
        throw new AuthorizationError('FORBIDDEN', 'Cannot remove the last organization owner');
      }
    }

    const roles = await tx<{ id: string }[]>`
      SELECT id FROM control_plane.roles
      WHERE organization_id = ${organizationId} AND key = ${input.roleKey} AND is_system = true
      LIMIT 1
    `;
    if (!roles[0]) throw new Error(`System role missing: ${input.roleKey}`);

    await tx`
      DELETE FROM control_plane.membership_roles mr
      USING control_plane.roles r
      WHERE mr.role_id = r.id
        AND mr.organization_id = ${organizationId}
        AND mr.membership_id = ${input.membershipId}
        AND r.is_system = true
    `;
    await tx`
      INSERT INTO control_plane.membership_roles (organization_id, membership_id, role_id)
      VALUES (${organizationId}, ${input.membershipId}, ${roles[0].id})
      ON CONFLICT DO NOTHING
    `;
    await tx`
      INSERT INTO control_plane.access_audit_log (
        id, organization_id, actor_id, action, target_type, target_id, request_id, metadata
      ) VALUES (
        ${randomUUID()}, ${organizationId}, ${input.session.user.id}, 'member.role_changed',
        'membership', ${input.membershipId}, ${input.requestId ?? null},
        ${JSON.stringify({ roleKey: input.roleKey })}::jsonb
      )
    `;
    return { membershipId: input.membershipId, roleKey: input.roleKey };
  });
}

export async function setMembershipStatus(input: {
  session: AuthenticatedSession;
  membershipId: string;
  status: 'active' | 'suspended';
  requestId?: string;
}) {
  const organizationId = requireMemberManager(input.session);
  if (input.membershipId === input.session.membershipId && input.status === 'suspended') {
    throw new AuthorizationError('FORBIDDEN', 'Cannot suspend the active membership used by this session');
  }
  const { sql } = getControlPlaneConnection();
  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.organization_id', ${organizationId}, true)`;
    await tx`select set_config('founder_os.actor_id', ${input.session.user.id}, true)`;

    const target = await tx<{ role_key: string | null }[]>`
      SELECT r.key AS role_key
      FROM control_plane.memberships m
      LEFT JOIN control_plane.membership_roles mr
        ON mr.membership_id = m.id AND mr.organization_id = m.organization_id
      LEFT JOIN control_plane.roles r
        ON r.id = mr.role_id AND r.organization_id = mr.organization_id AND r.is_system = true
      WHERE m.id = ${input.membershipId} AND m.organization_id = ${organizationId}
      ORDER BY CASE WHEN r.key = 'owner' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    if (!target[0]) throw new AuthorizationError('FORBIDDEN', 'Membership is unavailable');
    if (!input.session.roleKeys.includes('owner') && ['owner', 'admin'].includes(target[0].role_key ?? '')) {
      throw new AuthorizationError('FORBIDDEN', 'Only an owner can change owner/admin memberships');
    }
    if (target[0].role_key === 'owner' && input.status === 'suspended') {
      const owners = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM control_plane.membership_roles mr
        JOIN control_plane.roles r ON r.id = mr.role_id AND r.organization_id = mr.organization_id
        JOIN control_plane.memberships m ON m.id = mr.membership_id AND m.organization_id = mr.organization_id
        WHERE mr.organization_id = ${organizationId} AND r.key = 'owner' AND m.status = 'active'
      `;
      if ((owners[0]?.count ?? 0) <= 1) throw new AuthorizationError('FORBIDDEN', 'Cannot suspend the last organization owner');
    }

    await tx`
      UPDATE control_plane.memberships
      SET status = ${input.status}
      WHERE id = ${input.membershipId} AND organization_id = ${organizationId}
    `;
    if (input.status === 'suspended') {
      const users = await tx<{ user_id: string }[]>`
        SELECT user_id FROM control_plane.memberships
        WHERE id = ${input.membershipId} AND organization_id = ${organizationId} LIMIT 1
      `;
      if (users[0]) {
        await tx`
          UPDATE control_plane.user_sessions
          SET revoked_at = now()
          WHERE user_id = ${users[0].user_id}
            AND active_organization_id = ${organizationId}
            AND revoked_at IS NULL
        `;
      }
    }
    await tx`
      INSERT INTO control_plane.access_audit_log (
        id, organization_id, actor_id, action, target_type, target_id, request_id, metadata
      ) VALUES (
        ${randomUUID()}, ${organizationId}, ${input.session.user.id}, 'member.status_changed',
        'membership', ${input.membershipId}, ${input.requestId ?? null},
        ${JSON.stringify({ status: input.status })}::jsonb
      )
    `;
    return { membershipId: input.membershipId, status: input.status };
  });
}
