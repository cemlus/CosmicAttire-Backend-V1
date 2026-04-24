-- Seed data for testing the ESP verification flow

-- 1. Insert a test user into auth.users (if using local Supabase)
-- Note: In a real Supabase environment, you'd do this via the dashboard or Auth API.
-- This is a placeholder for local development.

-- 2. Insert test user profiles
INSERT INTO public.user_profiles (user_id, username, email, full_name, role, public_profile_url, permission)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test_user_authorized', 'auth@example.com', 'Authorized User', 'customer', 'profile-auth', 'yes'),
  ('00000000-0000-0000-0000-000000000002', 'test_user_unauthorized', 'unauth@example.com', 'Unauthorized User', 'customer', 'profile-unauth', 'no')
ON CONFLICT (user_id) DO UPDATE SET permission = EXCLUDED.permission;

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
