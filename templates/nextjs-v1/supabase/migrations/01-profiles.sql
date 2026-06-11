-- ============================================================
-- 01-profiles.sql — Canonical migration showing the SOP §5 RLS pattern.
-- Every v12 app starts with this migration.
-- Builder agent ADDS new migrations (02-, 03-, ...) for app-specific tables,
-- following the EXACT same pattern below.
-- ============================================================

-- profiles table — extends auth.users with app-specific fields (full_name, role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user'
    check (role in ('user', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── SOP §5: RLS on every table ──
alter table public.profiles enable row level security;

-- READ: users see their own profile; staff/admin see all.
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('staff', 'admin')
    )
  );

-- WRITE: deny all RLS-respecting writes. All mutations go through the admin
-- client in 'use server' actions per SOP §4.2 — the requireUser() gate is the
-- security boundary, not RLS.
drop policy if exists "profiles_insert_deny" on public.profiles;
create policy "profiles_insert_deny" on public.profiles
  for insert with check (false);

drop policy if exists "profiles_update_deny" on public.profiles;
create policy "profiles_update_deny" on public.profiles
  for update using (false);

drop policy if exists "profiles_delete_deny" on public.profiles;
create policy "profiles_delete_deny" on public.profiles
  for delete using (false);

-- ── Auto-update updated_at ──
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public   -- SOP §5: pinned search_path on every function
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Index for common lookup ──
create index if not exists idx_profiles_role on public.profiles(role);

comment on table public.profiles is 'User profile rows mirror auth.users with app-specific role + name. SOP §4.2: writes only via admin client behind requireUser/requireStaff/requireAdmin gate.';
