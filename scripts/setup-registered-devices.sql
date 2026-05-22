-- Safe setup for admin-managed valid Device IDs.
-- Run this without resetting existing data:
-- sudo -u postgres psql -d apidb -f scripts/setup-registered-devices.sql
--
-- If the application DB user is not apiuser, replace apiuser below with
-- the DB_USER value from the VPS .env file.

CREATE TABLE IF NOT EXISTS public.registered_devices (
  id bigserial PRIMARY KEY,
  device_id text UNIQUE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registered_devices_device_id
  ON public.registered_devices (device_id);

GRANT USAGE ON SCHEMA public TO apiuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registered_devices TO apiuser;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.registered_devices_id_seq TO apiuser;
