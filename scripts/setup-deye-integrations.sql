BEGIN;

CREATE TABLE IF NOT EXISTS deye_integrations (
  id bigserial PRIMARY KEY,
  plant_id bigint NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  station_id bigint NOT NULL UNIQUE CHECK (station_id > 0),
  source_device_id text NOT NULL UNIQUE REFERENCES registered_devices(device_id),
  primary_device_sn text,
  enabled boolean NOT NULL DEFAULT true,
  last_source_timestamp timestamp with time zone,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT deye_source_device_format_chk
    CHECK (source_device_id = 'DEYE_STATION_' || station_id::text)
);

ALTER TABLE deye_integrations
  ADD COLUMN IF NOT EXISTS station_name text,
  ADD COLUMN IF NOT EXISTS station_status text,
  ADD COLUMN IF NOT EXISTS station_capacity numeric;

CREATE TABLE IF NOT EXISTS deye_devices (
  id bigserial PRIMARY KEY,
  integration_id bigint NOT NULL REFERENCES deye_integrations(id) ON DELETE CASCADE,
  device_sn text NOT NULL UNIQUE,
  deye_device_id bigint,
  device_type text,
  connect_status integer,
  product_id text,
  last_seen timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deye_devices_integration
  ON deye_devices (integration_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_data_deye_source_sample
  ON device_data (device_id, category, type, created_at)
  WHERE device_id LIKE 'DEYE_STATION_%';

CREATE INDEX IF NOT EXISTS idx_deye_integrations_enabled
  ON deye_integrations (enabled)
  WHERE enabled = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apiuser') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON deye_integrations TO apiuser;
    GRANT SELECT, INSERT, UPDATE, DELETE ON deye_devices TO apiuser;
    GRANT USAGE, SELECT, UPDATE ON SEQUENCE deye_integrations_id_seq TO apiuser;
    GRANT USAGE, SELECT, UPDATE ON SEQUENCE deye_devices_id_seq TO apiuser;
  END IF;
END;
$$;

COMMIT;
