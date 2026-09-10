-- Phase 7 — user presentation preferences for global FounderOS.
-- Organization regional_preferences stay canonical for the business; these
-- nullable fields are per-human presentation overrides only.

CREATE TABLE IF NOT EXISTS control_plane.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES control_plane.users(id) ON DELETE CASCADE,
  locale text CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'es-419', 'en-US')),
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  timezone text,
  first_day_of_week integer CHECK (first_day_of_week IS NULL OR first_day_of_week BETWEEN 0 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON control_plane.user_preferences;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON control_plane.user_preferences
FOR EACH ROW EXECUTE FUNCTION control_plane.touch_updated_at();

ALTER TABLE control_plane.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_self_policy ON control_plane.user_preferences;
CREATE POLICY user_preferences_self_policy ON control_plane.user_preferences
  USING (user_id = control_plane.current_actor_id())
  WITH CHECK (user_id = control_plane.current_actor_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'founder_os_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON control_plane.user_preferences TO founder_os_app';
  END IF;
END;
$$;
