import { z } from 'zod';

const ControlPlaneConnectionSettingsSchema = z.object({
  maxConnections: z.number().int().min(1).max(50),
  idleTimeoutSeconds: z.number().int().min(1).max(600),
  connectTimeoutSeconds: z.number().int().min(1).max(60),
  ssl: z.enum(['require', 'prefer', 'disable']),
});

const ControlPlaneConfigSchema = ControlPlaneConnectionSettingsSchema.extend({
  databaseUrl: z.string().url(),
});

export type ControlPlaneConnectionSettings = z.infer<typeof ControlPlaneConnectionSettingsSchema>;
export type ControlPlaneConfig = z.infer<typeof ControlPlaneConfigSchema>;

export function getMigrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_MIGRATION_URL?.trim() || env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required for migrations');
  return z.string().url().parse(url);
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getControlPlaneConnectionSettings(
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneConnectionSettings {
  return ControlPlaneConnectionSettingsSchema.parse({
    maxConnections: intFromEnv(env.CONTROL_PLANE_DB_MAX_CONNECTIONS, 10),
    idleTimeoutSeconds: intFromEnv(env.CONTROL_PLANE_DB_IDLE_TIMEOUT_SECONDS, 20),
    connectTimeoutSeconds: intFromEnv(env.CONTROL_PLANE_DB_CONNECT_TIMEOUT_SECONDS, 10),
    ssl: env.CONTROL_PLANE_DB_SSL ?? 'prefer',
  });
}

export function isControlPlaneConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

export function getControlPlaneConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the PostgreSQL Control Plane');
  }

  return ControlPlaneConfigSchema.parse({
    databaseUrl,
    ...getControlPlaneConnectionSettings(env),
  });
}
