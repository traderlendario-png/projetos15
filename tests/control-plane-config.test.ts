import { describe, expect, test } from 'vitest';
import {
  getControlPlaneConfig,
  getControlPlaneConnectionSettings,
  getMigrationDatabaseUrl,
  isControlPlaneConfigured,
} from '@/lib/control-plane/config';

describe('Control Plane config', () => {
  test('is opt-in until DATABASE_URL exists', () => {
    expect(isControlPlaneConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  test('parses explicit pool and SSL settings', () => {
    const config = getControlPlaneConfig({
      DATABASE_URL: 'postgres://app:secret@localhost:5432/founder_os',
      CONTROL_PLANE_DB_MAX_CONNECTIONS: '7',
      CONTROL_PLANE_DB_IDLE_TIMEOUT_SECONDS: '30',
      CONTROL_PLANE_DB_CONNECT_TIMEOUT_SECONDS: '5',
      CONTROL_PLANE_DB_SSL: 'disable',
    } as unknown as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      maxConnections: 7,
      idleTimeoutSeconds: 30,
      connectTimeoutSeconds: 5,
      ssl: 'disable',
    });
  });

  test('refuses a missing database URL', () => {
    expect(() => getControlPlaneConfig({} as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });


  test('parses migration connection settings without requiring the application URL', () => {
    expect(
      getControlPlaneConnectionSettings({
        DATABASE_MIGRATION_URL: 'postgres://owner:secret@localhost:5432/founder_os',
        CONTROL_PLANE_DB_CONNECT_TIMEOUT_SECONDS: '4',
        CONTROL_PLANE_DB_SSL: 'disable',
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({
      connectTimeoutSeconds: 4,
      ssl: 'disable',
    });
  });

  test('prefers a separate migration owner URL', () => {
    expect(
      getMigrationDatabaseUrl({
        DATABASE_URL: 'postgres://app:secret@localhost:5432/founder_os',
        DATABASE_MIGRATION_URL: 'postgres://owner:secret@localhost:5432/founder_os',
      } as unknown as NodeJS.ProcessEnv),
    ).toContain('owner:secret');
  });
});

