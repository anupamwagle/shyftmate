-- Super admin seed
-- Password is set via SUPER_ADMIN_PASSWORD env var at runtime
-- This script seeds the platform org and super admin user

INSERT INTO organisations (id, name, slug, plan, timezone, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Gator Platform',
    'platform',
    'enterprise',
    'Australia/Sydney',
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Note: hashed_password is populated by the app startup seed script
-- (api/app/core/seed.py) using the SUPER_ADMIN_PASSWORD env var + bcrypt
INSERT INTO users (
    id, org_id, email, role, first_name, last_name, is_active, otp_verified
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'superadmin@gator.local',
    'super_admin',
    'Super',
    'Admin',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;
