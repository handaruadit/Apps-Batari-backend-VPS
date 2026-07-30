-- Safe setup for canonical plant access roles using the existing user_plants table.
-- Run without resetting data:
-- psql -d apidb -f scripts/setup-plant-access.sql

--===== (Plant Access Columns) ======
ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer';

ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

--===== (Remove Legacy Constraint) ======
ALTER TABLE public.user_plants
  DROP CONSTRAINT IF EXISTS user_plants_role_check;

--===== (Normalize Roles) ======
UPDATE public.user_plants
SET role = 'viewer'
WHERE role IS NULL
  OR trim(role) = ''
  OR role IN ('only_view', 'view_only', 'view');

UPDATE public.user_plants
SET role = 'editor'
WHERE role IN ('can_manage', 'manager', 'manage', 'manage_access');

UPDATE public.user_plants
SET role = 'owner'
WHERE role = 'admin';

--===== (Promote Sole Plant Owner) ======
WITH sole_access AS (
  SELECT plant_id
  FROM public.user_plants
  GROUP BY plant_id
  HAVING count(*) = 1
)
UPDATE public.user_plants up
SET role = 'owner'
FROM sole_access
WHERE up.plant_id = sole_access.plant_id
  AND up.role = 'viewer';

--===== (Canonical Role Constraint) ======
ALTER TABLE public.user_plants
  ADD CONSTRAINT user_plants_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));

--===== (Indexes) ======
CREATE INDEX IF NOT EXISTS idx_user_plants_user_id
  ON public.user_plants (user_id);

CREATE INDEX IF NOT EXISTS idx_user_plants_plant_id
  ON public.user_plants (plant_id);

CREATE INDEX IF NOT EXISTS idx_user_plants_role
  ON public.user_plants (role);
