-- Safe one-time setup for Forgot Password reset codes.
-- Run this as the PostgreSQL owner/admin user, for example:
-- sudo -u postgres psql -d apidb -f scripts/setup-password-reset-codes.sql
--
-- If the application DB user is not apiuser, replace apiuser in the GRANT
-- statements below with the DB_USER value from the VPS .env file.

DO $$
DECLARE
  users_id_type text;
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

  IF users_id_type IS NULL THEN
    RAISE EXCEPTION 'Cannot create password_reset_codes because public.users.id was not found';
  END IF;

  EXECUTE format($create_table$
    CREATE TABLE IF NOT EXISTS public.password_reset_codes (
      id bigserial PRIMARY KEY,
      user_id %s REFERENCES public.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      phone text,
      method text NOT NULL DEFAULT 'email',
      code_hash text NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      used_at timestamp with time zone,
      verified_at timestamp with time zone,
      created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  $create_table$, users_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_created
  ON public.password_reset_codes (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_phone_created
  ON public.password_reset_codes (phone, created_at DESC);

GRANT USAGE ON SCHEMA public TO apiuser;
GRANT SELECT, REFERENCES ON TABLE public.users TO apiuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.password_reset_codes TO apiuser;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.password_reset_codes_id_seq TO apiuser;
