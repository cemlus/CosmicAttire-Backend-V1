create extension if not exists "pgcrypto";

-- Allows this local/test seed to update backend-managed columns.
select set_config('request.jwt.claim.role', 'service_role', false);

insert into auth.users (
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
values
(
  '00000000-0000-0000-0000-000000000000',
  '36c973ef-a786-46ed-8be0-ecc4dc63ccc8',
  'authenticated',
  'authenticated',
  'customer@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Aarav Customer","role":"customer"}'::jsonb,
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  'b11886bb-3f43-4139-8e5a-4bbb15f44912',
  'authenticated',
  'authenticated',
  'luna@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Luna Coffee","role":"shopkeeper"}'::jsonb,
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '4f35bc3f-163d-4498-9885-cb44f8dd3b20',
  'authenticated',
  'authenticated',
  'nova@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Nova Merch","role":"shopkeeper"}'::jsonb,
  now(),
  now()
)
on conflict (id) do update set
  email = excluded.email,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into public.user_profiles (
  user_id,
  username,
  email,
  full_name,
  role,
  public_profile_url,
  public_data,
  permission,
  is_ticket_paid
)
values
(
  '36c973ef-a786-46ed-8be0-ecc4dc63ccc8',
  'demo_customer',
  'customer@example.com',
  'Aarav Customer',
  'customer',
  'profile-demo-customer',
  '{"name":"Aarav Customer","role":"Customer"}'::jsonb,
  'yes',
  true
),
(
  'b11886bb-3f43-4139-8e5a-4bbb15f44912',
  'luna_coffee',
  'luna@example.com',
  'Luna Coffee',
  'shopkeeper',
  'profile-luna-coffee',
  '{"name":"Luna Coffee","role":"Shopkeeper","category":"Cafe"}'::jsonb,
  'yes',
  true
),
(
  '4f35bc3f-163d-4498-9885-cb44f8dd3b20',
  'nova_merch',
  'nova@example.com',
  'Nova Merch',
  'shopkeeper',
  'profile-nova-merch',
  '{"name":"Nova Merch","role":"Shopkeeper","category":"Merchandise"}'::jsonb,
  'yes',
  true
)
on conflict (user_id) do update set
  username = excluded.username,
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  public_profile_url = excluded.public_profile_url,
  public_data = excluded.public_data,
  permission = excluded.permission,
  is_ticket_paid = excluded.is_ticket_paid;

insert into public.wallets (
  user_id,
  balance,
  currency
)
values
  ('36c973ef-a786-46ed-8be0-ecc4dc63ccc8', 750, 'INR'),
  ('b11886bb-3f43-4139-8e5a-4bbb15f44912', 120, 'INR'),
  ('4f35bc3f-163d-4498-9885-cb44f8dd3b20', 300, 'INR')
on conflict (user_id) do update set
  balance = excluded.balance,
  currency = excluded.currency,
  updated_at = now();

insert into public.rings (
  id,
  user_id,
  ring_id,
  nickname,
  status
)
values (
  '11111111-1111-1111-1111-111111111111',
  '36c973ef-a786-46ed-8be0-ecc4dc63ccc8',
  'NFC_CUSTOMER_DEMO',
  'Customer Demo Ring',
  'active'
)
on conflict (ring_id) do update set
  user_id = excluded.user_id,
  nickname = excluded.nickname,
  status = excluded.status,
  updated_at = now();

insert into public.payment_devices (
  mac_address,
  location,
  shopkeeper_id
)
values
(
  'PAY:LUNA:COFFEE:01',
  'Counter A',
  'b11886bb-3f43-4139-8e5a-4bbb15f44912'
),
(
  'PAY:NOVA:MERCH:01',
  'Booth B',
  '4f35bc3f-163d-4498-9885-cb44f8dd3b20'
)
on conflict (mac_address) do update set
  location = excluded.location,
  shopkeeper_id = excluded.shopkeeper_id,
  updated_at = now();

insert into public.ring_device_access (
  user_id,
  ring_id,
  mac_address,
  shopkeeper_id,
  status
)
values
(
  '36c973ef-a786-46ed-8be0-ecc4dc63ccc8',
  'NFC_CUSTOMER_DEMO',
  'PAY:LUNA:COFFEE:01',
  'b11886bb-3f43-4139-8e5a-4bbb15f44912',
  'active'
),
(
  '36c973ef-a786-46ed-8be0-ecc4dc63ccc8',
  'NFC_CUSTOMER_DEMO',
  'PAY:NOVA:MERCH:01',
  '4f35bc3f-163d-4498-9885-cb44f8dd3b20',
  'active'
)
on conflict (ring_id, mac_address, shopkeeper_id) do update set
  user_id = excluded.user_id,
  status = excluded.status,
  updated_at = now();
