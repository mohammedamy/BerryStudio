-- BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B: entitlement plumbing.
--
-- Run this once, by hand, in the Supabase project's SQL Editor (the same
-- project WP-42 Stage A already configured — see js/auth-config.js and
-- server/supabase/README.md). Not run automatically by anything: this repo
-- has no Supabase CLI/migration-runner wiring, same as Stage A's OAuth
-- provider setup was done directly in the dashboard, not from code.
--
-- What this creates: one `profiles` row per account, holding exactly the
-- two facts js/entitlement.js's computeEntitlement() needs — nothing else.
-- The row is created automatically at sign-up (trigger below) so the app
-- never has to race "did the row exist yet" on a brand-new account.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  -- 'trial' | 'active'. Deliberately NOT 'expired' as a storable value —
  -- see js/entitlement.js's header comment: expiry is always derived from
  -- trial_started_at at read time, never written here. There is no
  -- backend cron in Stage B to flip this on a timer.
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active')),
  trial_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'WP-42 Stage B: one row per account. subscription_status defaults to '
  '''trial'' at sign-up and is only ever changed by hand (admin flip, see '
  'server/supabase/README.md) or, once Stage C lands, a PayPal webhook — '
  'never by the client, which is why there is no client-writable RLS '
  'policy on this column below.';

-- Auto-create the profile row the moment a new auth.users row appears —
-- this is what makes trial_started_at a real, server-set sign-up
-- timestamp instead of something the client could claim. security definer
-- is required here: this function runs as the table owner so it can insert
-- into public.profiles from a trigger on auth.users, which the
-- unprivileged `authenticated`/`anon` roles have no access to at all.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: every signed-in user may READ their own row (the
-- client needs this to compute its own entitlement) and NOTHING ELSE.
-- No insert/update/delete policy exists for the authenticated role at
-- all — that's deliberate, not an oversight: it's what makes "only an
-- admin can flip subscription_status to active" a real, server-enforced
-- rule rather than a client-side convention a browser devtools session
-- could bypass. Only the service_role key (used from the Supabase SQL
-- Editor / dashboard, or a future Stage C webhook handler — never from
-- this codebase's client-side js/) can write to this table.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- Admin stopgap for Stage B (plan v3.2 §6): flip a specific account to an
-- active subscription by hand, standing in for the real PayPal webhook
-- Stage C will add later. Run in the SQL Editor (service_role context, so
-- RLS above doesn't block it) after finding the account's email in
-- Authentication -> Users:
--
--   update public.profiles set subscription_status = 'active', updated_at = now()
--   where email = 'someone@example.com';
--
-- To revert back to a plain (possibly already-expired) trial:
--
--   update public.profiles set subscription_status = 'trial', updated_at = now()
--   where email = 'someone@example.com';
-- ---------------------------------------------------------------------
