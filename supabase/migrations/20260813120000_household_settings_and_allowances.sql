-- Onboarding + configurable allowances.
--
-- Splits durable "structure" (household_settings: salary default, fixed
-- expense definitions, budget category definitions, allowance definitions)
-- from per-month "instance" data (budgets, unchanged shape apart from
-- fuel -> allowances) and from annual allowance running balances
-- (allowance_periods), which must survive across many monthly budgets rows
-- without resetting or double-counting.

create table household_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade unique,
  salary numeric not null default 0,
  fixed jsonb not null default '[]',      -- [{id, name, amount}]
  budget jsonb not null default '[]',     -- [{id, name, amount}]  (cap only, no items)
  allowances jsonb not null default '[]', -- [{id, name, period:'monthly'|'annual', amount, cashoutCap:number|null}]
  onboarded_at timestamptz,               -- null = onboarding not done yet; the gate
  updated_at timestamptz default now()
);

alter table household_settings enable row level security;

create policy "members can read/write their household settings"
on household_settings for all
using (is_household_member(household_id));

-- Annual allowance pools: exactly one row per household+allowance+year,
-- read/written by every month's dashboard in that year. Never snapshotted
-- into budgets, so nothing needs to stay in sync and there's no
-- double-count risk — remaining balance is always (amount - usage - cashout)
-- computed live against this one row.
create table allowance_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  allowance_id text not null,   -- matches an id inside household_settings.allowances
  period_year int not null,     -- calendar year
  usage_items jsonb not null default '[]',
  cashout_items jsonb not null default '[]',
  updated_at timestamptz default now(),
  unique (household_id, allowance_id, period_year)
);

alter table allowance_periods enable row level security;

create policy "members can read/write their household allowance periods"
on allowance_periods for all
using (is_household_member(household_id));

-- budgets.fuel -> budgets.allowances (monthly-period allowance instances
-- only; annual allowances live solely in allowance_periods above).
alter table budgets rename column fuel to allowances;
alter table budgets alter column allowances set default '[]';
