-- Safe setup for plant access roles using the existing user_plants table.
-- Run without resetting data:
-- psql -d apidb -f scripts/setup-plant-access.sql

ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'only_view';

ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.user_plants
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.user_plants
SET role = 'only_view'
WHERE role IS NULL OR trim(role) = '' OR role = 'viewer';

UPDATE public.user_plants
SET role = 'can_manage'
WHERE role IN ('manager', 'manage');

UPDATE public.user_plants
SET role = 'owner'
WHERE role = 'admin';

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
  AND up.role = 'only_view';

CREATE INDEX IF NOT EXISTS idx_user_plants_user_id
  ON public.user_plants (user_id);

CREATE INDEX IF NOT EXISTS idx_user_plants_plant_id
  ON public.user_plants (plant_id);

CREATE INDEX IF NOT EXISTS idx_user_plants_role
  ON public.user_plants (role);
