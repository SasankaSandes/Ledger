-- Rework: zero-based months with user-defined Cash In / Cash Out
-- categories, replacing the salary-baseline period model. Clean-slate —
-- no production data exists in this project yet (pre-launch), so old
-- tables/columns are dropped outright rather than backfilled.
--
-- Every step below is written to be safely re-runnable (if not exists /
-- if exists / drop-then-create guards) — this script is meant to be
-- pasted into the Supabase SQL Editor by hand, and re-running it after a
-- partial failure should just pick up where it left off rather than
-- erroring on "already exists".

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('in', 'out')),
  spend_limit numeric,              -- null = uncapped; app enforces this is out-only
  archived_at timestamptz,          -- soft delete: hidden from pickers, history intact
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,  -- must be type='out'
  name text not null,
  amount numeric not null default 0,
  active boolean not null default true,   -- soft delete: inactive = retired template, history intact
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Replaces `budgets`. Renamed because it's no longer a salary-cycle
-- "budget" row — it's just the container for one user-declared month.
create table if not exists periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  label text not null,                          -- e.g. "August 2026"
  started_at timestamptz not null default now(),
  ended_at timestamptz,                         -- null = currently open
  opening_balance numeric not null default 0,   -- carried forward from previous period's close
  created_at timestamptz default now()
);

-- DB-level enforcement of "one open period per household" — stronger than
-- the old app-layer-only invariant.
create unique index if not exists periods_one_open_per_household
  on periods (household_id) where ended_at is null;

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period_id uuid not null references periods(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  fixed_expense_id uuid references fixed_expenses(id) on delete set null, -- provenance tag only
  type text not null check (type in ('in', 'out')),
  amount numeric not null,                -- always positive; sign is implied by type
  description text not null default '',  -- "desc" is a reserved SQL keyword, so this column isn't named that
  date text not null,                     -- ISO YYYY-MM-DD, same convention as the old BudgetItem.date
  created_at timestamptz default now()
);

create index if not exists transactions_household_period_idx on transactions(household_id, period_id);
create index if not exists transactions_household_category_idx on transactions(household_id, category_id);
create index if not exists transactions_household_date_idx on transactions(household_id, date);
create index if not exists categories_household_type_idx on categories(household_id, type);
create index if not exists fixed_expenses_household_idx on fixed_expenses(household_id);

alter table categories enable row level security;
alter table fixed_expenses enable row level security;
alter table periods enable row level security;
alter table transactions enable row level security;

drop policy if exists "members can read/write their household categories" on categories;
create policy "members can read/write their household categories"
on categories for all
using (is_household_member(household_id));

drop policy if exists "members can read/write their household fixed_expenses" on fixed_expenses;
create policy "members can read/write their household fixed_expenses"
on fixed_expenses for all
using (is_household_member(household_id));

drop policy if exists "members can read/write their household periods" on periods;
create policy "members can read/write their household periods"
on periods for all
using (is_household_member(household_id));

drop policy if exists "members can read/write their household transactions" on transactions;
create policy "members can read/write their household transactions"
on transactions for all
using (is_household_member(household_id));

-- merchant_map: pot_id -> category_id, now a real FK (categories is a real
-- table). Scoped uniqueness gains `type` so a Cash In and Cash Out category
-- can't collide on the same first-word keyword. Existing rows point at old
-- short-id pots that only ever existed as jsonb objects, not real category
-- rows, so there's nothing a cast could meaningfully preserve — clear them
-- first; they'll relearn from normal use against the new category list.
-- Every step is existence-guarded since this table's shape changes
-- in place (rename + retype), unlike the plain create-if-not-exists
-- tables above.
truncate table merchant_map;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'merchant_map' and constraint_name = 'merchant_map_household_id_keyword_key'
  ) then
    alter table merchant_map drop constraint merchant_map_household_id_keyword_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'merchant_map' and column_name = 'pot_id'
  ) then
    alter table merchant_map rename column pot_id to category_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'merchant_map' and column_name = 'category_id' and data_type <> 'uuid'
  ) then
    alter table merchant_map alter column category_id type uuid using category_id::uuid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'merchant_map' and constraint_name = 'merchant_map_category_id_fkey'
  ) then
    alter table merchant_map add constraint merchant_map_category_id_fkey
      foreign key (category_id) references categories(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'merchant_map' and column_name = 'type'
  ) then
    alter table merchant_map add column type text not null default 'out' check (type in ('in', 'out'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'merchant_map' and constraint_name = 'merchant_map_household_id_type_keyword_key'
  ) then
    alter table merchant_map add constraint merchant_map_household_id_type_keyword_key
      unique (household_id, type, keyword);
  end if;
end $$;

-- Dropped outright — folded into the generic category/transaction model.
drop table if exists savings_collections;
drop table if exists debts;
drop table if exists allowance_periods;
drop table if exists budgets;

alter table household_settings
  drop column if exists salary,
  drop column if exists salary_date,
  drop column if exists fixed,
  drop column if exists pots,
  drop column if exists annual_allowances;
