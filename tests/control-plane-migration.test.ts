import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const source = readFileSync(
  path.resolve(process.cwd(), 'db/control-plane/0001_foundation.sql'),
  'utf8',
);

describe('PostgreSQL Control Plane migration', () => {
  test('is standalone-safe for the migration metadata table', () => {
    expect(source).toContain('CREATE TABLE IF NOT EXISTS control_plane.schema_migrations');
  });

  test('creates SaaS ownership boundaries but not OptimalEngine storage', () => {
    for (const table of [
      'users',
      'organizations',
      'memberships',
      'roles',
      'role_permissions',
      'membership_roles',
      'workspace_bindings',
      'plans',
      'subscriptions',
      'regional_preferences',
    ]) {
      expect(source).toContain(`control_plane.${table}`);
    }

    expect(source).not.toMatch(/CREATE TABLE[^;]*(rocksdb|claim|fact|memory|vector|derivation_ledger)/i);
  });

  test('enables PostgreSQL RLS on every organization-scoped table', () => {
    for (const table of [
      'users',
      'organizations',
      'regional_preferences',
      'memberships',
      'roles',
      'role_permissions',
      'membership_roles',
      'workspace_bindings',
      'subscriptions',
    ]) {
      expect(source).toContain(`ALTER TABLE control_plane.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test('scopes users to actor/bootstrap/current organization instead of exposing the directory', () => {
    expect(source).toContain('CREATE POLICY users_scope_policy');
    expect(source).toContain('current_bootstrap_email');
  });

  test('persists only a binding to OptimalEngine tenant/workspace identity', () => {
    expect(source).toContain('engine_tenant_id text NOT NULL');
    expect(source).toContain('engine_workspace_id text NOT NULL');
    expect(source).toContain('workspace_bindings_one_default_per_org_uidx');
  });

  test('stores the four launch locales as regional preferences', () => {
    expect(source).toContain("'pt-BR', 'pt-PT', 'es-419', 'en-US'");
  });
});
