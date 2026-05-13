CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  phone text UNIQUE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plants (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  location text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  timezone text DEFAULT 'Asia/Jakarta',
  system_type text NOT NULL,
  pv_capacity numeric NOT NULL,
  battery_capacity numeric DEFAULT 0,
  electricity_price numeric DEFAULT 0,
  currency text DEFAULT 'Rp',
  total_saving numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_plants (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  plant_id bigint REFERENCES plants(id) ON DELETE CASCADE,
  role text CHECK (role IN ('owner', 'editor', 'viewer')) DEFAULT 'viewer',
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, plant_id)
);

CREATE TABLE IF NOT EXISTS plant_devices (
  id bigserial PRIMARY KEY,
  device_id text UNIQUE NOT NULL,
  plant_id bigint REFERENCES plants(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_data (
  id bigserial PRIMARY KEY,
  device_id character varying(50),
  category character varying(50),
  type character varying(50),
  value numeric,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  method text NOT NULL DEFAULT 'email',
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_data_device_created
  ON device_data (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_data_filter
  ON device_data (device_id, category, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_created
  ON password_reset_codes (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_phone_created
  ON password_reset_codes (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_plants_user_id
  ON user_plants (user_id);

CREATE INDEX IF NOT EXISTS idx_user_plants_plant_id
  ON user_plants (plant_id);

CREATE INDEX IF NOT EXISTS idx_plant_devices_plant_id
  ON plant_devices (plant_id);

GRANT USAGE, CREATE ON SCHEMA public TO apiuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apiuser;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO apiuser;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apiuser;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO apiuser;
