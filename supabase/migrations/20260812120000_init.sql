-- Ledger: households, membership, per-month budgets, invites — with RLS
-- scoped to household membership, and a trigger that gives every new user
-- a household of their own the moment they sign up.

-- Households: the shared unit. A solo user is a household of one.
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  created_at timestamptz default now()
);

create table household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member'
  primary key (household_id, user_id)
);

-- One row per household per month — mirrors the artifact's JSON shape.
create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  month text not null, -- '2026-08'
  salary numeric not null default 0,
  fixed jsonb not null default '[]',   -- [{id,name,amount,paid}]
  budget jsonb not null default '[]',  -- [{id,name,amount,items:[{id,desc,amount}]}]
  fuel jsonb not null default '{"allowance":0,"usageItems":[],"cashoutItems":[]}',
  updated_at timestamptz default now(),
  unique (household_id, month)
);

-- Pending invites to join a household
create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  status text not null default 'pending', -- 'pending' | 'accepted'
  created_at timestamptz default now()
);

-- Membership check as a SECURITY DEFINER function: policies on
-- household_members can't query household_members directly (infinite RLS
-- recursion), so this runs as the table owner, bypassing RLS, and every
-- policy below calls it instead of inlining the subquery.
create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = target_household_id and user_id = auth.uid()
  );
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table budgets enable row level security;
alter table invites enable row level security;

create policy "members can read/write their household"
on households for all
using (is_household_member(id));

create policy "members can read/write their membership rows"
on household_members for all
using (is_household_member(household_id));

create policy "members can read/write their household budgets"
on budgets for all
using (is_household_member(household_id));

create policy "members can read/write their household invites"
on invites for all
using (is_household_member(household_id));

-- Auto-create a household + owner membership the moment someone signs up,
-- so a brand-new user already has somewhere to write budgets.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into households (name) values ('My Household') returning id into new_household_id;
  insert into household_members (household_id, user_id, role) values (new_household_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
