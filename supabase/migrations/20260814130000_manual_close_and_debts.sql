-- Manual period close + debts.
--
-- Periods move from date-derived (recomputed from salary_date + today on
-- every visit) to an explicit open/closed state: closed_at null means "the
-- currently active period." Closing is now something the user triggers, and
-- always requires placing every unallocated rupee and all cash in hand
-- somewhere (brought forward or saved) before it's allowed to complete.
alter table budgets add column closed_at timestamptz;

-- Existing households may have several rows from the old date-driven
-- auto-creation. Retroactively close every row except each household's
-- most recent, so the new "exactly one open row" invariant holds
-- immediately for pre-existing data.
with latest as (
  select distinct on (household_id) id
  from budgets
  order by household_id, month desc
)
update budgets
set closed_at = coalesce(updated_at, now())
where id not in (select id from latest);

-- rollover_resolved tracked the old skippable-banner flow; closed_at alone
-- now answers "is this period done."
alter table budgets drop column rollover_resolved;

-- Money you owe — a loan taken from a friend, your share of a bill someone
-- else covered, etc. Not period-scoped: a debt persists until paid, same
-- "just accumulates" philosophy as savings_collections. Simple paid/unpaid,
-- matching how fixed expenses already work, rather than itemized partial
-- repayments.
create table debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric not null,
  date text not null,
  paid_at timestamptz,
  created_at timestamptz default now()
);

alter table debts enable row level security;

create policy "members can read/write their household debts"
on debts for all
using (is_household_member(household_id));
