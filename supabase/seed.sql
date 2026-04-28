-- Seed data for testing the ESP verification flow
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Allows the seed to update protected backend-managed columns in local/test DBs.
SELECT set_config('request.jwt.claim.role', 'service_role', false);

-- 1. Insert test users into auth.users.
-- This is intended for a local/test Supabase project, not production.
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'auth@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Authorized User","role":"customer"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'unauth@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Unauthorized User","role":"customer"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

-- 2. Insert test user profiles
INSERT INTO public.user_profiles (
  user_id,
  username,
  email,
  full_name,
  role,
  public_profile_url,
  public_data,
  permission
)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    'test_user_authorized',
    'auth@example.com',
    'Authorized User',
    'customer',
    'profile-auth',
    '{"name":"Authorized User"}'::jsonb,
    'yes'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'test_user_unauthorized',
    'unauth@example.com',
    'Unauthorized User',
    'customer',
    'profile-unauth',
    '{"name":"Unauthorized User"}'::jsonb,
    'no'
  )
ON CONFLICT (user_id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  public_profile_url = EXCLUDED.public_profile_url,
  public_data = EXCLUDED.public_data,
  permission = EXCLUDED.permission;

-- 3. Insert hardware credentials
INSERT INTO public.verification_credentials (mac_address, lat, lng, radius_m, label, nfc_id)
VALUES 
  ('AA:BB:CC:DD:EE:FF', 40.7128, -74.0060, 200, 'Test Gateway 1', 'NFC_RING_123')
ON CONFLICT (mac_address) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, radius_m = EXCLUDED.radius_m, nfc_id = EXCLUDED.nfc_id;

-- 4. Insert ring mappings
INSERT INTO public.rings (user_id, ring_id, nickname, status)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'NFC_RING_123', 'My Test Ring', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'NFC_RING_456', 'Bad Ring', 'active')
ON CONFLICT (ring_id) DO NOTHING;
