import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { hashOpaqueToken, createOpaqueSessionToken } from './session-token';
import { AuthorizationError, canAssignSystemRole, isSystemRoleKey } from './rbac';
import type { AuthenticatedSession } from './sessions';
import { normalizeEmail } from './types';

export async function createInvitation(input: {
  session: AuthenticatedSession;
  email: string;
  roleKey: string;
  expiresInHours?: number;
  requestId?: string;
}) {
  const organization = input.session.organization;
  if (!organization || !input.session.membershipId) throw new AuthorizationError('NO_ACTIVE_ORGANIZATION');
  if (!input.session.permissions.has('members.manage')) throw new AuthorizationError('FORBIDDEN');
  if (!isSystemRoleKey(input.roleKey)) throw new Error('Invalid role');
  if (!canAssignSystemRole(input.session.roleKeys, input.roleKey)) {
    throw new AuthorizationError('FORBIDDEN', `Cannot assign role: ${input.roleKey}`);
  }

  const token = createOpaqueSessionToken();
  const tokenHash = hashOpaqueToken(token);
  const id = randomUUID();
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const expiresAt = new Date(Date.now() + Math.max(1, input.expiresInHours ?? 72) * 60 * 60 * 1000);
  const { sql } = getControlPlaneConnection();

  await sql.begin(async (tx) => {
    await tx`select set_config('founder_os.organization_id', ${organization.id}, true)`;
    await tx`select set_config('founder_os.actor_id', ${input.session.user.id}, true)`;
    if (input.requestId) await tx`select set_config('founder_os.request_id', ${input.requestId}, true)`;

    await tx`
      UPDATE control_plane.invitations
      SET status = 'revoked'
      WHERE organization_id = ${organization.id}
        AND email_normalized = ${emailNormalized}
        AND status = 'pending'
    `;
    await tx`
      INSERT INTO control_plane.invitations (
        id, organization_id, email, email_normalized, role_key,
        token_hash, invited_by, expires_at
      ) VALUES (
        ${id}, ${organization.id}, ${email}, ${emailNormalized}, ${input.roleKey},
        ${tokenHash}, ${input.session.user.id}, ${expiresAt.toISOString()}
      )
    `;
    await tx`
      INSERT INTO control_plane.access_audit_log (
        id, organization_id, actor_id, action, target_type, target_id, request_id, metadata
      ) VALUES (
        ${randomUUID()}, ${organization.id}, ${input.session.user.id}, 'member.invited',
        'invitation', ${id}, ${input.requestId ?? null},
        ${JSON.stringify({ roleKey: input.roleKey, emailNormalized })}::jsonb
      )
    `;
  });

  return { id, token, expiresAt, email, roleKey: input.roleKey };
}

export async function acceptInvitation(input: {
  session: AuthenticatedSession;
  token: string;
  requestId?: string;
}) {
  const tokenHash = hashOpaqueToken(input.token);
  const { sql } = getControlPlaneConnection();

  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.invitation_token_hash', ${tokenHash}, true)`;
    await tx`select set_config('founder_os.actor_id', ${input.session.user.id}, true)`;
    const rows = await tx<{
      id: string;
      organization_id: string;
      email_normalized: string;
      role_key: string;
      expires_at: Date;
      status: string;
    }[]>`
      SELECT id, organization_id, email_normalized, role_key, expires_at, status
      FROM control_plane.invitations
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;
    const invitation = rows[0];
    if (!invitation || invitation.status !== 'pending' || invitation.expires_at <= new Date()) {
      throw new AuthorizationError('FORBIDDEN', 'Invitation is invalid or expired');
    }
    if (normalizeEmail(input.session.user.email) !== invitation.email_normalized) {
      throw new AuthorizationError('FORBIDDEN', 'Invitation email does not match signed-in user');
    }
    await tx`select set_config('founder_os.organization_id', ${invitation.organization_id}, true)`;

    const membershipId = randomUUID();
    const memberships = await tx<{ id: string }[]>`
      INSERT INTO control_plane.memberships (
        id, organization_id, user_id, status, invited_by, joined_at
      )
      SELECT ${membershipId}, i.organization_id, ${input.session.user.id}, 'active', i.invited_by, now()
      FROM control_plane.invitations i WHERE i.id = ${invitation.id}
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        status = 'active', joined_at = COALESCE(control_plane.memberships.joined_at, now())
      RETURNING id
    `;
    const persistedMembershipId = memberships[0].id;

    const roles = await tx<{ id: string }[]>`
      SELECT id FROM control_plane.roles
      WHERE organization_id = ${invitation.organization_id}
        AND key = ${invitation.role_key}
      LIMIT 1
    `;
    if (!roles[0]) throw new Error(`System role missing: ${invitation.role_key}`);
    await tx`
      INSERT INTO control_plane.membership_roles (organization_id, membership_id, role_id)
      VALUES (${invitation.organization_id}, ${persistedMembershipId}, ${roles[0].id})
      ON CONFLICT DO NOTHING
    `;
    await tx`
      UPDATE control_plane.invitations
      SET status = 'accepted', accepted_by = ${input.session.user.id}, accepted_at = now()
      WHERE id = ${invitation.id}
    `;
    await tx`
      INSERT INTO control_plane.access_audit_log (
        id, organization_id, actor_id, action, target_type, target_id, request_id, metadata
      ) VALUES (
        ${randomUUID()}, ${invitation.organization_id}, ${input.session.user.id}, 'member.invitation_accepted',
        'membership', ${persistedMembershipId}, ${input.requestId ?? null},
        ${JSON.stringify({ roleKey: invitation.role_key })}::jsonb
      )
    `;
    return {
      organizationId: invitation.organization_id,
      membershipId: persistedMembershipId,
      roleKey: invitation.role_key,
    };
  });
}
