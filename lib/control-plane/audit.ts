import { randomUUID } from 'node:crypto';
import { getControlPlaneConnection } from './client';
import { withControlPlaneScope } from './scope';

export type AccessAuditEvent = {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  outcome?: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
};

export async function recordAccessAudit(event: AccessAuditEvent): Promise<void> {
  const { sql } = getControlPlaneConnection();
  if (event.organizationId && event.actorId) {
    await withControlPlaneScope(
      { organizationId: event.organizationId, actorId: event.actorId, requestId: event.requestId },
      async (tx) => {
        await tx`
          INSERT INTO control_plane.access_audit_log (
            id, organization_id, actor_id, action, target_type, target_id,
            request_id, outcome, metadata
          ) VALUES (
            ${randomUUID()}, ${event.organizationId}, ${event.actorId}, ${event.action},
            ${event.targetType ?? null}, ${event.targetId ?? null}, ${event.requestId ?? null},
            ${event.outcome ?? 'success'}, ${JSON.stringify(event.metadata ?? {})}::jsonb
          )
        `;
      },
    );
    return;
  }

  // Authentication events can exist before an organization is selected.
  await sql.begin(async (tx) => {
    if (event.actorId) await tx`select set_config('founder_os.actor_id', ${event.actorId}, true)`;
    await tx`
      INSERT INTO control_plane.access_audit_log (
        id, organization_id, actor_id, action, target_type, target_id,
        request_id, outcome, metadata
      ) VALUES (
        ${randomUUID()}, ${event.organizationId}, ${event.actorId}, ${event.action},
        ${event.targetType ?? null}, ${event.targetId ?? null}, ${event.requestId ?? null},
        ${event.outcome ?? 'success'}, ${JSON.stringify(event.metadata ?? {})}::jsonb
      )
    `;
  });
}
