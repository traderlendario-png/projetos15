import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getControlPlaneConfig } from './config';
import * as schema from './schema';

function createConnection() {
  const config = getControlPlaneConfig();
  const sql = postgres(config.databaseUrl, {
    max: config.maxConnections,
    idle_timeout: config.idleTimeoutSeconds,
    connect_timeout: config.connectTimeoutSeconds,
    ssl: config.ssl === 'disable' ? false : config.ssl,
    prepare: true,
    transform: { undefined: null },
  });

  return {
    sql,
    db: drizzle(sql, { schema }),
  };
}

type ControlPlaneConnection = ReturnType<typeof createConnection>;

type GlobalControlPlane = typeof globalThis & {
  __founderOsControlPlane?: ControlPlaneConnection;
};

export function getControlPlaneConnection(): ControlPlaneConnection {
  const globalRef = globalThis as GlobalControlPlane;
  if (!globalRef.__founderOsControlPlane) {
    globalRef.__founderOsControlPlane = createConnection();
  }
  return globalRef.__founderOsControlPlane;
}

export async function closeControlPlaneConnection(): Promise<void> {
  const globalRef = globalThis as GlobalControlPlane;
  const connection = globalRef.__founderOsControlPlane;
  if (!connection) return;
  await connection.sql.end({ timeout: 5 });
  delete globalRef.__founderOsControlPlane;
}
