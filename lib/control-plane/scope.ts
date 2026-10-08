import type postgres from 'postgres';
import { ControlPlaneScopeSchema, type ControlPlaneScope } from './types';
import { getControlPlaneConnection } from './client';

export type ControlPlaneTransaction = postgres.TransactionSql;

/**
 * Runs tenant-scoped work inside a DB transaction and installs PostgreSQL
 * session-local context used by Row Level Security policies.
 *
 * SET LOCAL semantics are achieved with set_config(..., true), so values never
 * leak into the next request when a pooled connection is reused.
 */
export async function withControlPlaneScope<T>(
  scopeInput: ControlPlaneScope,
  fn: (tx: ControlPlaneTransaction) => Promise<T>,
): Promise<T> {
  const scope = ControlPlaneScopeSchema.parse(scopeInput);
  const { sql } = getControlPlaneConnection();

  const result = await sql.begin(async (tx) => {
    await tx`select set_config('founder_os.organization_id', ${scope.organizationId}, true)`;
    await tx`select set_config('founder_os.actor_id', ${scope.actorId ?? ''}, true)`;
    await tx`select set_config('founder_os.request_id', ${scope.requestId ?? ''}, true)`;

    // postgres.js unwraps array-shaped callback results in its generic return
    // type. Wrapping the caller result in an object preserves T exactly for
    // arrays, tuples and scalars without weakening the transaction to `any`.
    return { value: await fn(tx) };
  });

  return result.value;
}

export async function currentControlPlaneScope(tx: postgres.TransactionSql): Promise<{
  organizationId: string | null;
  actorId: string | null;
  requestId: string | null;
}> {
  const [row] = await tx<{
    organization_id: string | null;
    actor_id: string | null;
    request_id: string | null;
  }[]>`
    select
      nullif(current_setting('founder_os.organization_id', true), '') as organization_id,
      nullif(current_setting('founder_os.actor_id', true), '') as actor_id,
      nullif(current_setting('founder_os.request_id', true), '') as request_id
  `;

  return {
    organizationId: row?.organization_id ?? null,
    actorId: row?.actor_id ?? null,
    requestId: row?.request_id ?? null,
  };
}

