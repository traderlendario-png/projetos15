import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { provisionSystemRoles } from './role-provisioning';
import {
  BootstrapOrganizationInputSchema,
  normalizeEmail,
  type BootstrapOrganizationInput,
} from './types';

export type BootstrapOrganizationResult = {
  userId: string;
  organizationId: string;
  membershipId: string;
  ownerRoleId: string;
  workspaceBindingId: string | null;
};

/**
 * Creates the first organization boundary atomically. The owner role receives
 * the full permission catalogue and the canonical admin/operator/viewer roles
 * are provisioned in the same transaction.
 */
export async function bootstrapOrganization(
  input: BootstrapOrganizationInput,
): Promise<BootstrapOrganizationResult> {
  const parsed = BootstrapOrganizationInputSchema.parse(input);
  const { sql } = getControlPlaneConnection();

  const userId = randomUUID();
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const workspaceBindingId = parsed.optimalEngine ? randomUUID() : null;
  const emailNormalized = normalizeEmail(parsed.owner.email);

  return sql.begin(async (tx) => {
    // Bootstrap is the one path that creates a new RLS boundary. Install the
    // new organization id before any tenant-scoped INSERT occurs.
    await tx`select set_config('founder_os.organization_id', ${organizationId}, true)`;
    await tx`select set_config('founder_os.bootstrap_email', ${emailNormalized}, true)`;

    const users = await tx<{ id: string }[]>`
      INSERT INTO control_plane.users (
        id, external_auth_id, email, email_normalized, display_name, status
      ) VALUES (
        ${userId},
        ${parsed.owner.externalAuthId ?? null},
        ${parsed.owner.email},
        ${emailNormalized},
        ${parsed.owner.displayName},
        'active'
      )
      ON CONFLICT (email_normalized) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        external_auth_id = COALESCE(control_plane.users.external_auth_id, EXCLUDED.external_auth_id),
        status = 'active'
      RETURNING id
    `;
    const persistedUserId = users[0].id;

    await tx`select set_config('founder_os.actor_id', ${persistedUserId}, true)`;

    await tx`
      INSERT INTO control_plane.organizations (id, slug, name, status, created_by)
      VALUES (${organizationId}, ${parsed.organization.slug}, ${parsed.organization.name}, 'active', ${persistedUserId})
    `;

    await tx`
      INSERT INTO control_plane.regional_preferences (
        organization_id, locale, country, currency, timezone, first_day_of_week
      ) VALUES (
        ${organizationId},
        ${parsed.region.locale},
        ${parsed.region.country},
        ${parsed.region.currency},
        ${parsed.region.timezone},
        ${parsed.region.firstDayOfWeek}
      )
    `;

    await tx`
      INSERT INTO control_plane.memberships (
        id, organization_id, user_id, status, joined_at
      ) VALUES (
        ${membershipId}, ${organizationId}, ${persistedUserId}, 'active', now()
      )
    `;

    const systemRoles = await provisionSystemRoles(tx, organizationId);
    const ownerRoleId = systemRoles.owner;

    await tx`
      INSERT INTO control_plane.membership_roles (organization_id, membership_id, role_id)
      VALUES (${organizationId}, ${membershipId}, ${ownerRoleId})
      ON CONFLICT DO NOTHING
    `;

    if (parsed.optimalEngine && workspaceBindingId) {
      await tx`
        INSERT INTO control_plane.workspace_bindings (
          id, organization_id, slug, display_name, status, is_default,
          engine_tenant_id, engine_organization_id, engine_workspace_id
        ) VALUES (
          ${workspaceBindingId},
          ${organizationId},
          ${parsed.optimalEngine.workspaceSlug},
          ${parsed.optimalEngine.workspaceName},
          'active',
          true,
          ${parsed.optimalEngine.tenantId},
          ${parsed.optimalEngine.organizationId ?? null},
          ${parsed.optimalEngine.workspaceId}
        )
      `;
    }

    return {
      userId: persistedUserId,
      organizationId,
      membershipId,
      ownerRoleId,
      workspaceBindingId,
    };
  });
}
