-- Correction: Pots are NOT Cash Out categories. Categories (both Cash In
-- and Cash Out) are pure organizing/filtering tags with no limit. A Pot is
-- a separate budget entity with a spend limit; a transaction optionally
-- carries a pot_id (independent of its category_id) to say "this spend
-- also counts against this budget." A category and a pot have no
-- structural link to each other — any combination is allowed at the
-- transaction level.
--
-- Safely re-runnable, same as the previous two migrations.

create table if not exists pots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  spend_limit numeric not null default 0,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists pots_household_idx on pots(household_id);

alter table pots enable row level security;

drop policy if exists "members can read/write their household pots" on pots;
create policy "members can read/write their household pots"
on pots for all
using (is_household_member(household_id));

-- Categories never had a real "budget limit" meaning — that's what Pots
-- are for.
alter table categories drop column if exists spend_limit;

-- Fixed expenses never consume a Pot's limit (they're already accounted
-- for separately), so their posted transactions simply never set pot_id —
-- no exclusion logic needed elsewhere, it falls out naturally.
alter table transactions add column if not exists pot_id uuid references pots(id) on delete set null;

create index if not exists transactions_household_pot_idx on transactions(household_id, pot_id);
