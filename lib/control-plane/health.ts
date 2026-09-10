import { performance } from 'node:perf_hooks';
import { isControlPlaneConfigured } from './config';
import { getControlPlaneConnection } from './client';

export type ControlPlaneHealth = {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  schemaVersion: string | null;
  detail: string;
};

export async function getControlPlaneHealth(): Promise<ControlPlaneHealth> {
  if (!isControlPlaneConfigured()) {
    return {
      configured: false,
      ok: false,
      latencyMs: null,
      schemaVersion: null,
      detail: 'DATABASE_URL is not configured',
    };
  }

  const started = performance.now();
  try {
    const { sql } = getControlPlaneConnection();
    await sql`SELECT 1 AS ok`;
    const migrations = await sql<{ name: string }[]>`
      SELECT name
      FROM control_plane.schema_migrations
      ORDER BY name DESC
      LIMIT 1
    `;
    return {
      configured: true,
      ok: true,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      schemaVersion: migrations[0]?.name ?? null,
      detail: 'PostgreSQL Control Plane reachable',
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      schemaVersion: null,
      detail:
        process.env.NODE_ENV === 'production'
          ? 'PostgreSQL Control Plane unavailable'
          : error instanceof Error
            ? error.message
            : 'Unknown PostgreSQL error',
    };
  }
}
