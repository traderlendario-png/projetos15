-- FounderOS Control Plane — Phase 6: human identity, durable sessions and RBAC.
-- This migration deliberately keeps authentication/session state out of OptimalEngine.

CREATE OR REPLACE FUNCTION control_plane.current_session_token_hash()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('founder_os.session_token_hash', true), '');
$$;

CREATE OR REPLACE FUNCTION control_plane.current_identity_provider()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('founder_os.identity_provider', true), '');
$$;

CREATE OR REPLACE FUNCTION control_plane.current_identity_subject()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('founder_os.identity_subject', true), '');
$$;

CREATE OR REPLACE FUNCTION control_plane.current_invitation_token_hash()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('founder_os.invitation_token_hash', true), '');
$$;

-- SECURITY DEFINER exposes only a boolean and lets RLS ask whether the current
-- actor has a permission without recursive policy evaluation.
CREATE OR REPLACE FUNCTION control_plane.current_actor_has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, control_plane
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM control_plane.memberships m
    JOIN control_plane.membership_roles mr
      ON mr.membership_id = m.id AND mr.organization_id = m.organization_id
    JOIN control_plane.role_permissions rp
      ON rp.role_id = mr.role_id AND rp.organization_id = mr.organization_id
    WHERE m.user_id = control_plane.current_actor_id()
      AND m.organization_id = control_plane.current_organization_id()
      AND m.status = 'active'
      AND rp.permission_key = required_permission
  );
$$;
REVOKE ALL ON FUNCTION control_plane.current_actor_has_permission(text) FROM PUBLIC;

-- Deterministic UUIDs make the four system roles backfillable without pgcrypto.
CREATE OR REPLACE FUNCTION control_plane.stable_uuid(input text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT (
    substr(md5(input), 1, 8) || '-' ||
    substr(md5(input), 9, 4) || '-' ||
    substr(md5(input), 13, 4) || '-' ||
    substr(md5(input), 17, 4) || '-' ||
    substr(md5(input), 21, 12)
  )::uuid;
$$;

CREATE TABLE IF NOT EXISTS control_plane.user_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES control_plane.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  subject text NOT NULL,
  email_at_link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identities_provider_subject_unique UNIQUE (provider, subject),
  CONSTRAINT user_identities_provider_check CHECK (provider ~ '^[a-z0-9][a-z0-9._:-]{0,79}$')
);
CREATE INDEX IF NOT EXISTS user_identities_user_idx ON control_plane.user_identities (user_id);

CREATE TABLE IF NOT EXISTS control_plane.user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES control_plane.users(id) ON DELETE CASCADE,
  identity_id uuid REFERENCES control_plane.user_identities(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  active_organization_id uuid REFERENCES control_plane.organizations(id) ON DELETE SET NULL,
  active_workspace_binding_id uuid REFERENCES control_plane.workspace_bindings(id) ON DELETE SET NULL,
  auth_method text NOT NULL DEFAULT 'external',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_sessions_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT user_sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON control_plane.user_sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_active_org_idx ON control_plane.user_sessions (active_organization_id);

CREATE OR REPLACE FUNCTION control_plane.validate_session_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bound_org uuid;
BEGIN
  IF NEW.active_workspace_binding_id IS NOT NULL THEN
    IF NEW.active_organization_id IS NULL THEN
      RAISE EXCEPTION 'active workspace requires active organization';
    END IF;
    SELECT organization_id INTO bound_org
    FROM control_plane.workspace_bindings
    WHERE id = NEW.active_workspace_binding_id;
    IF bound_org IS DISTINCT FROM NEW.active_organization_id THEN
      RAISE EXCEPTION 'session workspace does not belong to active organization';
    END IF;
  END IF;

  IF NEW.active_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM control_plane.memberships m
    WHERE m.organization_id = NEW.active_organization_id
      AND m.user_id = NEW.user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'session user is not an active member of organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_scope ON control_plane.user_sessions;
CREATE TRIGGER validate_scope
BEFORE INSERT OR UPDATE OF user_id, active_organization_id, active_workspace_binding_id
ON control_plane.user_sessions
FOR EACH ROW EXECUTE FUNCTION control_plane.validate_session_scope();

CREATE TABLE IF NOT EXISTS control_plane.invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES control_plane.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_normalized text NOT NULL,
  role_key text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES control_plane.users(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES control_plane.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT invitations_role_key_check CHECK (role_key IN ('owner', 'admin', 'operator', 'viewer')),
  CONSTRAINT invitations_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitations_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS invitations_org_status_idx
  ON control_plane.invitations (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_email_idx
  ON control_plane.invitations (email_normalized, status);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending_per_org_email_uidx
  ON control_plane.invitations (organization_id, email_normalized)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS control_plane.access_audit_log (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES control_plane.organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES control_plane.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  request_id text,
  outcome text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_audit_outcome_check CHECK (outcome IN ('success', 'denied', 'error'))
);
CREATE INDEX IF NOT EXISTS access_audit_org_time_idx
  ON control_plane.access_audit_log (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS access_audit_actor_time_idx
  ON control_plane.access_audit_log (actor_id, occurred_at DESC);

INSERT INTO control_plane.permissions (key, description) VALUES
  ('app.read', 'Access authenticated FounderOS product surfaces'),
  ('app.write', 'Mutate legacy FounderOS product-domain state')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- Backfill the four canonical roles for every existing organization.
INSERT INTO control_plane.roles (id, organization_id, key, name, description, is_system)
SELECT
  control_plane.stable_uuid(o.id::text || ':role:' || r.key),
  o.id,
  r.key,
  r.name,
  r.description,
  true
FROM control_plane.organizations o
CROSS JOIN (VALUES
  ('owner', 'Owner', 'Organization owner; unrestricted Control Plane access'),
  ('admin', 'Admin', 'Administration without ownership/billing mutation'),
  ('operator', 'Operator', 'Day-to-day operational access with governed actions'),
  ('viewer', 'Viewer', 'Read-only business and audit access')
) AS r(key, name, description)
ON CONFLICT (organization_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = true;

-- Owner: complete permission catalogue.
INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.key
FROM control_plane.roles r
CROSS JOIN control_plane.permissions p
WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;

-- Admin: almost everything, but billing mutation remains owner-only.
INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.key
FROM control_plane.roles r
JOIN control_plane.permissions p ON p.key <> 'billing.manage'
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

-- Operator: governed operations, no organization/member/integration administration.
INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.key
FROM control_plane.roles r
JOIN control_plane.permissions p ON p.key IN (
  'app.read', 'app.write',
  'organization.read', 'members.read', 'workspaces.read', 'settings.read',
  'agents.run', 'knowledge.read', 'knowledge.write', 'integrations.read',
  'approvals.read', 'approvals.decide'
)
WHERE r.key = 'operator'
ON CONFLICT DO NOTHING;

-- Viewer: read-only surfaces, including audit visibility.
INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.key
FROM control_plane.roles r
JOIN control_plane.permissions p ON p.key IN (
  'app.read',
  'organization.read', 'members.read', 'workspaces.read', 'billing.read',
  'settings.read', 'knowledge.read', 'integrations.read', 'approvals.read', 'audit.read'
)
WHERE r.key = 'viewer'
ON CONFLICT DO NOTHING;

-- Ensure existing owners remain owners even when their original role UUID predates
-- the deterministic role backfill. Existing owner role permissions are refreshed.
INSERT INTO control_plane.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.key
FROM control_plane.roles r
CROSS JOIN control_plane.permissions p
WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;

-- Maintain updated_at for mutable identity/RBAC state.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_identities', 'user_sessions', 'invitations']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON control_plane.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON control_plane.%I FOR EACH ROW EXECUTE FUNCTION control_plane.touch_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE control_plane.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.access_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_identities_scope_policy ON control_plane.user_identities;
CREATE POLICY user_identities_scope_policy ON control_plane.user_identities
  USING (
    user_id = control_plane.current_actor_id()
    OR (
      provider = control_plane.current_identity_provider()
      AND subject = control_plane.current_identity_subject()
    )
  )
  WITH CHECK (
    user_id = control_plane.current_actor_id()
    OR (
      provider = control_plane.current_identity_provider()
      AND subject = control_plane.current_identity_subject()
    )
  );

DROP POLICY IF EXISTS user_sessions_scope_policy ON control_plane.user_sessions;
CREATE POLICY user_sessions_scope_policy ON control_plane.user_sessions
  USING (
    user_id = control_plane.current_actor_id()
    OR token_hash = control_plane.current_session_token_hash()
    OR (
      active_organization_id = control_plane.current_organization_id()
      AND control_plane.current_actor_has_permission('members.manage')
    )
  )
  WITH CHECK (
    user_id = control_plane.current_actor_id()
    OR (
      active_organization_id = control_plane.current_organization_id()
      AND control_plane.current_actor_has_permission('members.manage')
    )
  );

DROP POLICY IF EXISTS invitations_scope_policy ON control_plane.invitations;
CREATE POLICY invitations_scope_policy ON control_plane.invitations
  USING (
    organization_id = control_plane.current_organization_id()
    OR token_hash = control_plane.current_invitation_token_hash()
  )
  WITH CHECK (organization_id = control_plane.current_organization_id());

DROP POLICY IF EXISTS access_audit_scope_policy ON control_plane.access_audit_log;
CREATE POLICY access_audit_scope_policy ON control_plane.access_audit_log
  USING (organization_id = control_plane.current_organization_id())
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = control_plane.current_organization_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'founder_os_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION control_plane.current_actor_has_permission(text) TO founder_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON control_plane.user_identities TO founder_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON control_plane.user_sessions TO founder_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON control_plane.invitations TO founder_os_app';
    EXECUTE 'GRANT SELECT, INSERT ON control_plane.access_audit_log TO founder_os_app';
  END IF;
END;
$$;
