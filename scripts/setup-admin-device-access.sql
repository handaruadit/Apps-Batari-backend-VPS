-- Safe one-time setup for admin device access.
-- Run this as the PostgreSQL owner/admin user, for example:
-- sudo -u postgres psql -d apidb -f scripts/setup-admin-device-access.sql
--
-- If the application DB user is not apiuser, replace apiuser in the GRANT
-- statements below with the DB_USER value from the VPS .env file.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

DO $$
DECLARE
  users_id_type text;
  plants_id_type text;
BEGIN
  SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO users_id_type
  FROM pg_attribute attribute
  JOIN pg_class class ON class.oid = attribute.attrelid
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relname = 'users'
    AND attribute.attname = 'id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO plants_id_type
  FROM pg_attribute attribute
  JOIN pg_class class ON class.oid = attribute.attrelid
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relname = 'plants'
    AND attribute.attname = 'id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF users_id_type IS NULL THEN
    RAISE EXCEPTION 'Cannot create device_access_permissions because public.users.id was not found';
  END IF;

  IF plants_id_type IS NULL THEN
    RAISE EXCEPTION 'Cannot create device_access_permissions because public.plants.id was not found';
  END IF;

  EXECUTE format($create_table$
    CREATE TABLE IF NOT EXISTS public.device_access_permissions (
      id bigserial PRIMARY KEY,
      user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      plant_id %s NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
      device_id text NOT NULL,
      allowed boolean NOT NULL DEFAULT false,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now(),
      UNIQUE (user_id, plant_id, device_id)
    )
  $create_table$, users_id_type, plants_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_device_access_permissions_user_plant
  ON public.device_access_permissions (user_id, plant_id);

CREATE INDEX IF NOT EXISTS idx_device_access_permissions_device
  ON public.device_access_permissions (device_id);

GRANT USAGE ON SCHEMA public TO apiuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_access_permissions TO apiuser;
GRANT SELECT, UPDATE ON TABLE public.users TO apiuser;
GRANT SELECT ON TABLE public.plants TO apiuser;
GRANT SELECT ON TABLE public.user_plants TO apiuser;
GRANT SELECT ON TABLE public.plant_devices TO apiuser;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.device_access_permissions_id_seq TO apiuser;
