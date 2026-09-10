-- Local development only. Production credentials must come from a secrets manager.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'founder_os_app') THEN
    CREATE ROLE founder_os_app LOGIN PASSWORD 'founder_os_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

GRANT CONNECT ON DATABASE founder_os TO founder_os_app;
