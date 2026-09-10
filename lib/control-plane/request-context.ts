import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { requireRequestSession } from './request-auth';

/** Canonical actor/scope envelope that later flows into OptimalEngine calls. */
export async function getRequestActorContext() {
  const session = await requireRequestSession();
  const requestHeaders = await headers();
  const requestId = requestHeaders.get('x-request-id') ?? randomUUID();
  return {
    requestId,
    actorId: session.user.id,
    organizationId: session.organization?.id ?? null,
    workspaceBindingId: session.workspace?.id ?? null,
    optimalEngine: session.workspace
      ? {
          tenantId: session.workspace.engineTenantId,
          organizationId: session.workspace.engineOrganizationId,
          workspaceId: session.workspace.engineWorkspaceId,
        }
      : null,
    roleKeys: session.roleKeys,
    permissions: [...session.permissions],
    regional: session.regional,
  };
}
