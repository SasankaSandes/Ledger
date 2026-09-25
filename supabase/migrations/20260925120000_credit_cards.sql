-- Credit cards: a "paid with" choice on Cash Out, plus a bill-payment
-- transaction that settles what's owed on a card.
--
-- Model
--   cards                 household-scoped like pots: a name, a monthly
--                         spend_limit (0 = no limit), and opening_owed for a
--                         balance that predates tracking it here.
--   transactions.card_id  set on a Cash Out => "charged to this card". That
--                         spend is OWED, not cash out: the client keeps it out
--                         of the month balance and adds it to the card's owed
--                         amount until a payment settles it.
--   transactions.type = 'card_payment'
--                         a bill payment. Cash leaves (lowers the month
--                         balance) and the card's owed amount drops. It has no
--                         category and no pot, so category_id becomes nullable.
--   fixed_expenses.card_id
--                         optional default card a confirmed fixed expense is
--                         charged to.
--   card_balances (view)  lifetime spent / paid per card. Owed is
--                         opening_owed + spent - paid across ALL periods, and
--                         Home only ever loads one period, so it's summed here.
--
-- Safely re-runnable, same as the previous migrations: paste it into the
-- Supabase SQL Editor and re-run after a partial failure if needed.
-- Apply after 20260904130000_schema_hardening_b.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. cards
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  spend_limit numeric not null default 0,
  opening_owed numeric not null default 0,
  archived_at timestamptz,                  -- soft delete: hidden from pickers, history intact
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint cards_name_len check (char_length(btrim(name)) between 1 and 100),
  constraint cards_spend_limit_nonneg check (spend_limit >= 0),
  constraint cards_opening_owed_nonneg check (opening_owed >= 0)
);

create index if not exists cards_household_idx on public.cards(household_id);

drop trigger if exists trg_set_row_updated on public.cards;
create trigger trg_set_row_updated before update on public.cards
  for each row execute function public.set_row_updated();

alter table public.cards enable row level security;

drop policy if exists "cards household access" on public.cards;
create policy "cards household access" on public.cards for all
  using (household_id = (select household_id from public.household_members
                         where user_id = (select auth.uid())))
  with check (household_id = (select household_id from public.household_members
                              where user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transactions: card_id, nullable category_id, 'card_payment' type
--    card_id has no ON DELETE action on purpose: cards are only ever
--    soft-deleted (archived_at), and SET NULL would silently turn owed card
--    spend into cash spend if a card row were ever removed.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions add column if not exists card_id uuid references public.cards(id);
create index if not exists transactions_card_id_idx on public.transactions(card_id);

alter table public.transactions alter column category_id drop not null;

-- Drop whatever single-column CHECK currently guards `type` (auto-named
-- transactions_type_check in the rework migration, but don't rely on that),
-- then add the widened one.
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.conrelid = 'public.transactions'::regclass
      and con.contype = 'c'
      and array_length(con.conkey, 1) = 1
      and a.attname = 'type'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end $$;

alter table public.transactions drop constraint if exists transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('in', 'out', 'card_payment'));

-- Shape per type: cash in never sits on a card, cash out always has a
-- category, and a card payment is exactly "card + amount" — no category, no pot.
alter table public.transactions drop constraint if exists transactions_card_shape;
alter table public.transactions add constraint transactions_card_shape check (
  case type
    when 'in'           then card_id is null and category_id is not null
    when 'out'          then category_id is not null
    when 'card_payment' then card_id is not null and category_id is null and pot_id is null
  end
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fixed_expenses: optional default card
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.fixed_expenses add column if not exists card_id uuid references public.cards(id);
create index if not exists fixed_expenses_card_id_idx on public.fixed_expenses(card_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cross-household integrity for the new reference (see hardening B §3).
--    Redefines the transactions trigger function with card_id added; every
--    existing check is carried over unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.assert_transaction_same_household()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hh uuid;
begin
  if new.category_id is not null then
    select household_id into hh from public.categories where id = new.category_id;
    if found and hh <> new.household_id then
      raise exception 'category % belongs to another household', new.category_id;
    end if;
  end if;
  if new.period_id is not null then
    select household_id into hh from public.periods where id = new.period_id;
    if found and hh <> new.household_id then
      raise exception 'period % belongs to another household', new.period_id;
    end if;
  end if;
  if new.pot_id is not null then
    select household_id into hh from public.pots where id = new.pot_id;
    if found and hh <> new.household_id then
      raise exception 'pot % belongs to another household', new.pot_id;
    end if;
  end if;
  if new.fixed_expense_id is not null then
    select household_id into hh from public.fixed_expenses where id = new.fixed_expense_id;
    if found and hh <> new.household_id then
      raise exception 'fixed expense % belongs to another household', new.fixed_expense_id;
    end if;
  end if;
  if new.card_id is not null then
    select household_id into hh from public.cards where id = new.card_id;
    if found and hh <> new.household_id then
      raise exception 'card % belongs to another household', new.card_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.assert_fixed_expense_card_same_household()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hh uuid;
begin
  if new.card_id is not null then
    select household_id into hh from public.cards where id = new.card_id;
    if found and hh <> new.household_id then
      raise exception 'card % belongs to another household', new.card_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fixed_expenses_card_same_household on public.fixed_expenses;
create trigger trg_fixed_expenses_card_same_household
  before insert or update on public.fixed_expenses
  for each row execute function public.assert_fixed_expense_card_same_household();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. card_balances: lifetime spent / paid per card
--    security_invoker makes the view run with the CALLER's rights, so the RLS
--    on cards + transactions still scopes it to the caller's household.
--    Owed (computed client-side) = cards.opening_owed + spent - paid.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.card_balances
with (security_invoker = on) as
select
  c.id as card_id,
  c.household_id,
  coalesce(sum(t.amount) filter (where t.type = 'out'), 0)          as spent,
  coalesce(sum(t.amount) filter (where t.type = 'card_payment'), 0) as paid
from public.cards c
left join public.transactions t on t.card_id = c.id
group by c.id, c.household_id;

revoke all on public.card_balances from anon, public;
grant select on public.card_balances to authenticated;
