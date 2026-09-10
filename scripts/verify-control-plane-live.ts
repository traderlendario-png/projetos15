import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  getControlPlaneConfig,
  getControlPlaneConnectionSettings,
  getMigrationDatabaseUrl,
} from '../lib/control-plane/config';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const appConfig = getControlPlaneConfig();
  const connection = getControlPlaneConnectionSettings();
  const migrationUrl = getMigrationDatabaseUrl();

  const appSql = postgres(appConfig.databaseUrl, {
    max: 1,
    connect_timeout: connection.connectTimeoutSeconds,
    idle_timeout: connection.idleTimeoutSeconds,
    ssl: connection.ssl === 'disable' ? false : connection.ssl,
    prepare: false,
  });
  const ownerSql = postgres(migrationUrl, {
    max: 1,
    connect_timeout: connection.connectTimeoutSeconds,
    idle_timeout: connection.idleTimeoutSeconds,
    ssl: connection.ssl === 'disable' ? false : connection.ssl,
    prepare: false,
  });

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const userA = randomUUID();
  const userB = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const forbiddenRole = randomUUID();
  const slugA = `probe-a-${suffix}`;
  const slugB = `probe-b-${suffix}`;

  try {
    const [appIdentity] = await appSql<{
      role_name: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }[]>`
      SELECT
        current_user AS role_name,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `;
    assert(appIdentity, 'Could not resolve the PostgreSQL application role');
    assert(!appIdentity.is_superuser, 'Application role must not be SUPERUSER');
    assert(!appIdentity.bypasses_rls, 'Application role must not have BYPASSRLS');

    const [tableIdentity] = await appSql<{ table_owner: string }[]>`
      SELECT pg_get_userbyid(c.relowner) AS table_owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'control_plane'
        AND c.relname = 'organizations'
        AND c.relkind = 'r'
    `;
    assert(tableIdentity, 'control_plane.organizations is missing; run npm run db:migrate first');
    assert(
      tableIdentity.table_owner !== appIdentity.role_name,
      'Application role owns tenant tables and would bypass RLS',
    );

    // Seed two isolated tenants with the migration/owner connection. This role
    // owns the tables and exists only for schema administration, never requests.
    await ownerSql.begin(async (tx) => {
      await tx`
        INSERT INTO control_plane.users (id, email, email_normalized, display_name)
        VALUES
          (${userA}, ${`probe-a-${suffix}@example.invalid`}, ${`probe-a-${suffix}@example.invalid`}, 'RLS Probe A'),
          (${userB}, ${`probe-b-${suffix}@example.invalid`}, ${`probe-b-${suffix}@example.invalid`}, 'RLS Probe B')
      `;
      await tx`
        INSERT INTO control_plane.organizations (id, slug, name, created_by)
        VALUES
          (${orgA}, ${slugA}, 'RLS Probe A', ${userA}),
          (${orgB}, ${slugB}, 'RLS Probe B', ${userB})
      `;
      await tx`
        INSERT INTO control_plane.memberships (id, organization_id, user_id, status, joined_at)
        VALUES
          (${membershipA}, ${orgA}, ${userA}, 'active', now()),
          (${membershipB}, ${orgB}, ${userB}, 'active', now())
      `;
    });

    const visibleOrganizations = await appSql.begin(async (tx) => {
      await tx`select set_config('founder_os.organization_id', ${orgA}, true)`;
      await tx`select set_config('founder_os.actor_id', ${userA}, true)`;
      return tx<{ id: string }[]>`
        SELECT id
        FROM control_plane.organizations
        WHERE id IN (${orgA}, ${orgB})
        ORDER BY id
      `;
    });
    assert(
      visibleOrganizations.length === 1 && visibleOrganizations[0]?.id === orgA,
      `RLS read isolation failed: expected only organization A, got ${visibleOrganizations.map((row) => row.id).join(', ')}`,
    );

    const visibleUsers = await appSql.begin(async (tx) => {
      await tx`select set_config('founder_os.organization_id', ${orgA}, true)`;
      await tx`select set_config('founder_os.actor_id', ${userA}, true)`;
      return tx<{ id: string }[]>`
        SELECT id
        FROM control_plane.users
        WHERE id IN (${userA}, ${userB})
        ORDER BY id
      `;
    });
    assert(
      visibleUsers.length === 1 && visibleUsers[0]?.id === userA,
      'RLS user-directory isolation failed',
    );

    let crossTenantWriteBlocked = false;
    try {
      await appSql.begin(async (tx) => {
        await tx`select set_config('founder_os.organization_id', ${orgA}, true)`;
        await tx`select set_config('founder_os.actor_id', ${userA}, true)`;
        await tx`
          INSERT INTO control_plane.roles (
            id, organization_id, key, name, description, is_system
          ) VALUES (
            ${forbiddenRole}, ${orgB}, 'rls-probe', 'Forbidden cross-tenant role', '', false
          )
        `;
      });
    } catch {
      crossTenantWriteBlocked = true;
    }
    assert(crossTenantWriteBlocked, 'RLS cross-tenant write isolation failed');

    console.log(
      JSON.stringify(
        {
          ok: true,
          appRole: appIdentity.role_name,
          tableOwner: tableIdentity.table_owner,
          appRoleSuperuser: appIdentity.is_superuser,
          appRoleBypassesRls: appIdentity.bypasses_rls,
          organizationReadIsolation: 'PASS',
          userDirectoryIsolation: 'PASS',
          crossTenantWriteIsolation: 'PASS',
        },
        null,
        2,
      ),
    );
  } finally {
    // Owner connection guarantees cleanup even when the app-role assertion
    // fails midway. The probe uses unique UUIDs/slugs and never touches real data.
    try {
      await ownerSql`DELETE FROM control_plane.organizations WHERE id IN (${orgA}, ${orgB})`;
      await ownerSql`DELETE FROM control_plane.users WHERE id IN (${userA}, ${userB})`;
    } catch {
      // If the schema was never migrated, there is nothing to clean up.
    }
    await Promise.allSettled([
      appSql.end({ timeout: 5 }),
      ownerSql.end({ timeout: 5 }),
    ]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
