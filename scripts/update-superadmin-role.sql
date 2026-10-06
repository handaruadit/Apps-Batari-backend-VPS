-- ============================================================
-- SQL Script: Update Super Admin Roles
-- Database: apidb (PostgreSQL)
-- ============================================================

-- 1. Update role to 'super_admin' for admin@batarienergy.com and idewanyomanbayusw@gmail.com
UPDATE users 
SET role = 'super_admin' 
WHERE LOWER(email) IN ('admin@batarienergy.com', 'idewanyomanbayusw@gmail.com');

-- 2. Verify updated records
SELECT id, email, role, name, phone, created_at 
FROM users 
WHERE LOWER(email) IN ('admin@batarienergy.com', 'idewanyomanbayusw@gmail.com')
ORDER BY id ASC;
