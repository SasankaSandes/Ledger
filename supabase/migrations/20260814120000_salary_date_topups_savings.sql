-- Salary-date periods, dated spends, and savings collections.
--
-- household_settings.salary_date lets a household's "period" roll over on a
-- day other than the 1st of the calendar month; default 1 keeps existing
-- households behaving exactly as today (period == calendar month) until
-- they change it.
alter table household_settings add column salary_date int not null default 1;

-- Per-period itemized top-ups (carried-forward leftovers, or cash pulled in
-- from a savings collection) — same shape as every other item list, and
-- rollover_resolved marks whether this period's eventual leftover has had
-- its carry-forward-or-save decision made (or explicitly skipped) yet.
alter table budgets add column top_ups jsonb not null default '[]';
alter table budgets add column rollover_resolved boolean not null default false;

-- Named savings pots. Not period-scoped — a collection just persists and
-- accumulates. Balance is always sum(transactions[].amount), computed on
-- read, same "nothing to keep in sync" approach as allowance_periods.
create table savings_collections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  transactions jsonb not null default '[]', -- [{id, desc, amount, date}], + deposit / - withdrawal
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table savings_collections enable row level security;

create policy "members can read/write their household savings"
on savings_collections for all
using (is_household_member(household_id));
