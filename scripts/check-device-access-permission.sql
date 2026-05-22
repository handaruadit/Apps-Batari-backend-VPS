-- Validation query for admin device access.
-- This checks permission state without removing the plant_devices mapping.
--
-- Expected when admin switch is OFF:
--   device_id is still present, allowed = false
--
-- Expected when admin switch is ON:
--   device_id is still present, allowed = true

SELECT
  u.email,
  p.id AS plant_id,
  p.name AS plant_name,
  pd.device_id,
  COALESCE(dap.allowed, false) AS allowed
FROM user_plants up
JOIN users u ON u.id = up.user_id
JOIN plants p ON p.id = up.plant_id
LEFT JOIN plant_devices pd ON pd.plant_id = p.id
LEFT JOIN device_access_permissions dap
  ON dap.user_id = u.id
  AND dap.plant_id = p.id
  AND dap.device_id = pd.device_id
WHERE p.name = 'Plant Testing'
  AND pd.device_id = 'INV001'
ORDER BY p.id DESC;
