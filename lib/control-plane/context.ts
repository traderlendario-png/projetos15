import { getControlPlaneConnection } from './client';
import { withControlPlaneScope } from './scope';

export type OrganizationContext = {
  organization: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  region: {
    locale: string;
    country: string;
    currency: string;
    timezone: string;
    firstDayOfWeek: number;
  } | null;
  workspaces: Array<{
    id: string;
    slug: string;
    displayName: string;
    isDefault: boolean;
    engineTenantId: string;
    engineOrganizationId: string | null;
    engineWorkspaceId: string;
  }>;
};

export async function getOrganizationContext(input: {
  organizationId: string;
  actorId: string;
  requestId?: string;
}): Promise<OrganizationContext | null> {
  return withControlPlaneScope(input, async (tx) => {
    const organizations = await tx<{
      id: string;
      slug: string;
      name: string;
      status: string;
    }[]>`
      SELECT id, slug, name, status
      FROM control_plane.organizations
      WHERE id = ${input.organizationId}
      LIMIT 1
    `;
    const organization = organizations[0];
    if (!organization) return null;

    const regions = await tx<{
      locale: string;
      country: string;
      currency: string;
      timezone: string;
      first_day_of_week: number;
    }[]>`
      SELECT locale, country, currency, timezone, first_day_of_week
      FROM control_plane.regional_preferences
      WHERE organization_id = ${input.organizationId}
      LIMIT 1
    `;

    const workspaces = await tx<{
      id: string;
      slug: string;
      display_name: string;
      is_default: boolean;
      engine_tenant_id: string;
      engine_organization_id: string | null;
      engine_workspace_id: string;
    }[]>`
      SELECT
        id, slug, display_name, is_default,
        engine_tenant_id, engine_organization_id, engine_workspace_id
      FROM control_plane.workspace_bindings
      WHERE organization_id = ${input.organizationId}
        AND status = 'active'
      ORDER BY is_default DESC, created_at ASC
    `;

    const region = regions[0];
    return {
      organization,
      region: region
        ? {
            locale: region.locale,
            country: region.country,
            currency: region.currency,
            timezone: region.timezone,
            firstDayOfWeek: region.first_day_of_week,
          }
        : null,
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        slug: workspace.slug,
        displayName: workspace.display_name,
        isDefault: workspace.is_default,
        engineTenantId: workspace.engine_tenant_id,
        engineOrganizationId: workspace.engine_organization_id,
        engineWorkspaceId: workspace.engine_workspace_id,
      })),
    };
  });
}

export async function listActorOrganizations(actorId: string) {
  const { sql } = getControlPlaneConnection();
  return sql.begin(async (tx) => {
    await tx`select set_config('founder_os.actor_id', ${actorId}, true)`;
    return tx<{
      id: string;
      slug: string;
      name: string;
      status: string;
      membership_status: string;
    }[]>`
      SELECT o.id, o.slug, o.name, o.status, m.status AS membership_status
      FROM control_plane.memberships m
      JOIN control_plane.organizations o ON o.id = m.organization_id
      WHERE m.user_id = ${actorId}
        AND m.status = 'active'
        AND o.status = 'active'
      ORDER BY o.name ASC
    `;
  });
}
