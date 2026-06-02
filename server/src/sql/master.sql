-- =========================================================
-- Supabase normalized schema
-- Paste this into the Supabase SQL editor and run once.
-- Assumption: email-based auth. If you use phone-only auth,
-- make user_profiles.email nullable.
-- =========================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- =========================================================
-- Helper functions
-- =========================================================

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Protect important profile fields from normal client updates
create or replace function public.protect_user_profile_updates()
returns trigger
language plpgsql
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  -- Only backend/service_role should be able to change identity/admin fields
  if caller_role <> 'service_role' then
    new.user_id := old.user_id;
    new.username := old.username;
    new.email := old.email;
    new.role := old.role;
    new.public_profile_url := old.public_profile_url;
    new.permission := old.permission;
    new.is_ticket_paid := old.is_ticket_paid;

    -- Prevent escalation by protecting public_data->'role' and public_data->'type'
    if coalesce(new.public_data->>'role', '') <> coalesce(old.public_data->>'role', '') then
      if (old.public_data ? 'role') then
        new.public_data := jsonb_set(new.public_data, '{role}', old.public_data->'role');
      else
        new.public_data := new.public_data - 'role';
      end if;
    end if;

    if coalesce(new.public_data->>'type', '') <> coalesce(old.public_data->>'type', '') then
      if (old.public_data ? 'type') then
        new.public_data := jsonb_set(new.public_data, '{type}', old.public_data->'type');
      else
        new.public_data := new.public_data - 'type';
      end if;
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- Protect sensitive ring fields from normal client updates
create or replace function public.protect_ring_updates()
returns trigger
language plpgsql
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if caller_role <> 'service_role' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.ring_id := old.ring_id;
    new.status := old.status;
    new.created_at := old.created_at;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- Protect device identity fields from normal client updates
create or replace function public.protect_payment_device_updates()
returns trigger
language plpgsql
as $$
declare
  caller_role text;
begin
  caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if caller_role <> 'service_role' then
    new.id := old.id;
    new.mac_address := old.mac_address;
    new.shopkeeper_id := old.shopkeeper_id;
    new.created_at := old.created_at;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create app rows when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  short_id text;
begin
  short_id := substr(replace(new.id::text, '-', ''), 1, 12);

  insert into public.user_profiles (
    user_id,
    username,
    email,
    full_name,
    role,
    public_profile_url
  )
  values (
    new.id,
    'user_' || short_id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'customer'),
    'profile-' || short_id
  );

  insert into public.wallets (user_id)
  values (new.id);

  insert into public.otp_verifications (user_id)
  values (new.id);

  return new;
end;
$$;

-- =========================================================
-- Tables
-- =========================================================



-- =========================================================
-- Indexes
-- =========================================================



-- =========================================================
-- Triggers
-- =========================================================

drop trigger if exists trg_user_profiles_protect_updates on public.user_profiles;
create trigger trg_user_profiles_protect_updates
before update on public.user_profiles
for each row execute function public.protect_user_profile_updates();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_otp_verifications_updated_at on public.otp_verifications;
create trigger trg_otp_verifications_updated_at
before update on public.otp_verifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_rings_protect_updates on public.rings;
create trigger trg_rings_protect_updates
before update on public.rings
for each row execute function public.protect_ring_updates();

drop trigger if exists trg_payment_devices_protect_updates on public.payment_devices;
create trigger trg_payment_devices_protect_updates
before update on public.payment_devices
for each row execute function public.protect_payment_device_updates();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- Auto-create profile / wallet / OTP rows after signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================



-- =========================================================
-- Policies
-- =========================================================

-- user_profiles
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- wallets
drop policy if exists "Users can read own wallet" on public.wallets;
create policy "Users can read own wallet"
on public.wallets
for select
to authenticated
using (auth.uid() = user_id);

-- otp_verifications
drop policy if exists "Users can read own otp verification" on public.otp_verifications;
create policy "Users can read own otp verification"
on public.otp_verifications
for select
to authenticated
using (auth.uid() = user_id);

-- rings
drop policy if exists "Users can read own rings" on public.rings;
create policy "Users can read own rings"
on public.rings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own rings" on public.rings;
create policy "Users can insert own rings"
on public.rings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own rings" on public.rings;
create policy "Users can update own rings"
on public.rings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own rings" on public.rings;
create policy "Users can delete own rings"
on public.rings
for delete
to authenticated
using (auth.uid() = user_id);

-- payment_devices
drop policy if exists "Shopkeepers can read own devices" on public.payment_devices;
create policy "Shopkeepers can read own devices"
on public.payment_devices
for select
to authenticated
using (auth.uid() = shopkeeper_id);

drop policy if exists "Shopkeepers can insert own devices" on public.payment_devices;
create policy "Shopkeepers can insert own devices"
on public.payment_devices
for insert
to authenticated
with check (auth.uid() = shopkeeper_id);

drop policy if exists "Shopkeepers can update own devices" on public.payment_devices;
create policy "Shopkeepers can update own devices"
on public.payment_devices
for update
to authenticated
using (auth.uid() = shopkeeper_id)
with check (auth.uid() = shopkeeper_id);

drop policy if exists "Shopkeepers can delete own devices" on public.payment_devices;
create policy "Shopkeepers can delete own devices"
on public.payment_devices
for delete
to authenticated
using (auth.uid() = shopkeeper_id);

-- transactions
drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

-- user_logs
drop policy if exists "Users can read own logs" on public.user_logs;
create policy "Users can read own logs"
on public.user_logs
for select
to authenticated
using (auth.uid() = user_id);

-- verification_credentials
-- Keep this locked down for backend/service-role use only.
-- No RLS policy added intentionally.

-- =========================================================
-- Grants
-- =========================================================

grant usage on schema public to anon, authenticated;

grant select, update on public.user_profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.otp_verifications to authenticated;
grant select, insert, update, delete on public.rings to authenticated;
grant select, insert, update, delete on public.payment_devices to authenticated;
grant select on public.transactions to authenticated;
grant select on public.user_logs to authenticated;

-- verification_credentials is backend/admin-only; no client grant needed