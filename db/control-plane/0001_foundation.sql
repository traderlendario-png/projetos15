-- FounderOS Control Plane foundation (PostgreSQL)
-- Scope: human identity, organizations, memberships, RBAC data model,
-- OptimalEngine workspace bindings, billing catalog/subscriptions, region prefs.
-- OptimalEngine persistence (RocksDB/Exqlite/vector/ledger) remains separate.

CREATE SCHEMA IF NOT EXISTS control_plane;

-- The runner creates this table before applying numbered migrations so it can
-- enforce checksums. Keeping the declaration here as well makes 0001 safe to
-- inspect or apply directly without making its final grants depend on runner
-- bootstrapping order.
CREATE TABLE IF NOT EXISTS control_plane.schema_migrations (
  name text PRIMARY KEY,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION control_plane.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('founder_os.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION control_plane.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('founder_os.actor_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION control_plane.current_bootstrap_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('founder_os.bootstrap_email', true), '')
$$;

CREATE OR REPLACE FUNCTION control_plane.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS control_plane.users (
  id uuid PRIMARY KEY,
  external_auth_id text,
  email text NOT NULL,
  email_normalized text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized_format CHECK (email_normalized = lower(btrim(email_normalized)))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_uidx
  ON control_plane.users (email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS users_external_auth_id_uidx
  ON control_plane.users (external_auth_id);

CREATE TABLE IF NOT EXISTS control_plane.organizations (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_by uuid REFERENCES control_plane.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uidx
  ON control_plane.organizations (slug);

CREATE TABLE IF NOT EXISTS control_plane.regional_preferences (
  organization_id uuid PRIMARY KEY REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'pt-BR' CHECK (locale IN ('pt-BR', 'pt-PT', 'es-419', 'en-US')),
  country text NOT NULL DEFAULT 'BR' CHECK (country ~ '^[A-Z]{2}$'),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  first_day_of_week integer NOT NULL DEFAULT 1 CHECK (first_day_of_week BETWEEN 0 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_plane.memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES control_plane.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES control_plane.users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT memberships_org_user_unique UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON control_plane.memberships (user_id);
CREATE INDEX IF NOT EXISTS memberships_org_status_idx ON control_plane.memberships (organization_id, status);

CREATE TABLE IF NOT EXISTS control_plane.permissions (
  key text PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_plane.roles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT roles_org_key_unique UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS control_plane.role_permissions (
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES control_plane.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT role_permissions_role_org_fk
    FOREIGN KEY (role_id, organization_id)
    REFERENCES control_plane.roles(id, organization_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS role_permissions_org_idx
  ON control_plane.role_permissions (organization_id);

CREATE TABLE IF NOT EXISTS control_plane.membership_roles (
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (membership_id, role_id),
  CONSTRAINT membership_roles_membership_org_fk
    FOREIGN KEY (membership_id, organization_id)
    REFERENCES control_plane.memberships(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT membership_roles_role_org_fk
    FOREIGN KEY (role_id, organization_id)
    REFERENCES control_plane.roles(id, organization_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS membership_roles_org_idx
  ON control_plane.membership_roles (organization_id);

CREATE TABLE IF NOT EXISTS control_plane.workspace_bindings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_default boolean NOT NULL DEFAULT false,
  engine_tenant_id text NOT NULL,
  engine_organization_id text,
  engine_workspace_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_bindings_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT workspace_bindings_org_slug_unique UNIQUE (organization_id, slug),
  CONSTRAINT workspace_bindings_org_engine_ws_unique UNIQUE (organization_id, engine_workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_bindings_engine_ws_idx
  ON control_plane.workspace_bindings (engine_workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_bindings_one_default_per_org_uidx
  ON control_plane.workspace_bindings (organization_id)
  WHERE is_default = true AND status = 'active';

CREATE TABLE IF NOT EXISTS control_plane.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_plane.subscriptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  plan_id text REFERENCES control_plane.plans(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  external_customer_id text,
  external_subscription_id text,
  status text NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete')),
  seat_limit integer CHECK (seat_limit IS NULL OR seat_limit > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx
  ON control_plane.subscriptions (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_external_uidx
  ON control_plane.subscriptions (provider, external_subscription_id);

-- Permission catalogue is global. Roles remain organization-scoped so each
-- tenant can evolve policy without changing another tenant.
INSERT INTO control_plane.permissions (key, description) VALUES
  ('organization.read', 'View organization profile'),
  ('organization.manage', 'Change organization profile and lifecycle'),
  ('members.read', 'View organization members'),
  ('members.manage', 'Invite, suspend and manage members'),
  ('workspaces.read', 'View OptimalEngine workspace bindings'),
  ('workspaces.manage', 'Create and manage OptimalEngine workspace bindings'),
  ('billing.read', 'View plan, usage and subscription data'),
  ('billing.manage', 'Change plan and billing settings'),
  ('settings.read', 'View organization settings'),
  ('settings.manage', 'Change organization settings'),
  ('agents.run', 'Run approved agents'),
  ('agents.manage', 'Manage agent configuration and policies'),
  ('knowledge.read', 'Read governed knowledge and memory'),
  ('knowledge.write', 'Create governed knowledge and memory'),
  ('integrations.read', 'View configured integrations'),
  ('integrations.manage', 'Manage integration configuration'),
  ('approvals.read', 'View approval requests'),
  ('approvals.decide', 'Approve or reject governed actions'),
  ('audit.read', 'Read audit and provenance records')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- Keep updated_at correct even when writes come from integrations or jobs.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'organizations', 'regional_preferences', 'memberships', 'roles',
    'workspace_bindings', 'plans', 'subscriptions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON control_plane.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON control_plane.%I FOR EACH ROW EXECUTE FUNCTION control_plane.touch_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

-- Tenant-scoped tables use PostgreSQL RLS as a second isolation boundary.
-- Production MUST connect with a non-owner application role so RLS cannot be
-- bypassed by table ownership. The migration/owner role stays separate.
ALTER TABLE control_plane.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.regional_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.workspace_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.subscriptions ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS users_scope_policy ON control_plane.users;
CREATE POLICY users_scope_policy ON control_plane.users
  USING (
    id = control_plane.current_actor_id()
    OR email_normalized = control_plane.current_bootstrap_email()
    OR EXISTS (
      SELECT 1
      FROM control_plane.memberships m
      WHERE m.user_id = users.id
        AND m.organization_id = control_plane.current_organization_id()
    )
  )
  WITH CHECK (
    id = control_plane.current_actor_id()
    OR email_normalized = control_plane.current_bootstrap_email()
  );

DROP POLICY IF EXISTS organizations_tenant_policy ON control_plane.organizations;
CREATE POLICY organizations_tenant_policy ON control_plane.organizations
  USING (
    id = control_plane.current_organization_id()
    OR EXISTS (
      SELECT 1
      FROM control_plane.memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = control_plane.current_actor_id()
        AND m.status = 'active'
    )
  )
  WITH CHECK (id = control_plane.current_organization_id());

DROP POLICY IF EXISTS memberships_tenant_policy ON control_plane.memberships;
CREATE POLICY memberships_tenant_policy ON control_plane.memberships
  USING (
    organization_id = control_plane.current_organization_id()
    OR user_id = control_plane.current_actor_id()
  )
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS regional_preferences_tenant_policy ON control_plane.regional_preferences;
CREATE POLICY regional_preferences_tenant_policy ON control_plane.regional_preferences
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS roles_tenant_policy ON control_plane.roles;
CREATE POLICY roles_tenant_policy ON control_plane.roles
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS role_permissions_tenant_policy ON control_plane.role_permissions;
CREATE POLICY role_permissions_tenant_policy ON control_plane.role_permissions
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS membership_roles_tenant_policy ON control_plane.membership_roles;
CREATE POLICY membership_roles_tenant_policy ON control_plane.membership_roles
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS workspace_bindings_tenant_policy ON control_plane.workspace_bindings;
CREATE POLICY workspace_bindings_tenant_policy ON control_plane.workspace_bindings
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS subscriptions_tenant_policy ON control_plane.subscriptions;
CREATE POLICY subscriptions_tenant_policy ON control_plane.subscriptions
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (organization_id = control_plane.current_organization_id());

-- Dev/local convenience only: if a non-owner role named founder_os_app exists,
-- grant the minimum schema/table access required by the current Control Plane.
-- Managed production should provision its own role and equivalent grants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'founder_os_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA control_plane TO founder_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON '
      || 'control_plane.users, '
      || 'control_plane.organizations, '
      || 'control_plane.regional_preferences, '
      || 'control_plane.memberships, '
      || 'control_plane.roles, '
      || 'control_plane.role_permissions, '
      || 'control_plane.membership_roles, '
      || 'control_plane.workspace_bindings, '
      || 'control_plane.subscriptions '
      || 'TO founder_os_app';
    EXECUTE 'GRANT SELECT ON control_plane.permissions, control_plane.plans, '
      || 'control_plane.schema_migrations TO founder_os_app';
  END IF;
END;
$$;
