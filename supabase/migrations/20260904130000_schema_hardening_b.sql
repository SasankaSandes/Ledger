-- Schema hardening, part B — touches live data. See docs/SCHEMA_AUDIT.md.
--
-- Apply ONLY after supabase/precheck_schema_hardening.sql returns 0 for
-- bad_dates, dup_month_key, and every xhh_* row. This one can rewrite the
-- transactions table (date retype) and take brief locks.
--
-- Pair: 20260904120000_schema_hardening_a.sql (safe / additive, apply first).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. transactions.date : text → real date  (D4)
--    PostgREST serialises `date` as 'YYYY-MM-DD' and accepts the same on write,
--    which is exactly what every client producer/consumer already uses.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions
  alter column date type date using date::date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. one period per (household, month)  (D5)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.periods drop constraint if exists periods_household_month_key_uniq;
alter table public.periods add constraint periods_household_month_key_uniq
  unique (household_id, month_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. cross-household referential integrity  (S2)
--    A transaction / merchant_map row may only reference rows in its own
--    household. Enforced with BEFORE triggers rather than composite FKs:
--    a composite FK with ON DELETE SET NULL on the nullable refs would try to
--    null the NOT NULL household_id too.
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
  return new;
end;
$$;

drop trigger if exists trg_transactions_same_household on public.transactions;
create trigger trg_transactions_same_household
  before insert or update on public.transactions
  for each row execute function public.assert_transaction_same_household();

create or replace function public.assert_merchant_map_same_household()
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
  return new;
end;
$$;

drop trigger if exists trg_merchant_map_same_household on public.merchant_map;
create trigger trg_merchant_map_same_household
  before insert or update on public.merchant_map
  for each row execute function public.assert_merchant_map_same_household();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS: one function call per row → one sub-select per statement  (P1, P3)
--    A user is in exactly one household (household_members_one_per_user), so
--    the blanket policies collapse to a single equality against that id.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('categories',        'members can read/write their household categories'),
      ('fixed_expenses',    'members can read/write their household fixed_expenses'),
      ('periods',           'members can read/write their household periods'),
      ('transactions',      'members can read/write their household transactions'),
      ('pots',              'members can read/write their household pots'),
      ('merchant_map',      'members can read/write their household merchant_map'),
      ('household_settings','members can read/write their household settings')
    ) as v(tbl, oldname)
  loop
    execute format('drop policy if exists %I on public.%I', spec.oldname, spec.tbl);
    execute format('drop policy if exists %I on public.%I',
                   spec.tbl || ' household access', spec.tbl);
    execute format($f$
      create policy %I on public.%I for all
      using (household_id = (select household_id from public.household_members
                             where user_id = (select auth.uid())))
      with check (household_id = (select household_id from public.household_members
                                 where user_id = (select auth.uid())))
    $f$, spec.tbl || ' household access', spec.tbl);
  end loop;
end $$;

drop policy if exists "members can read their household" on public.households;
drop policy if exists "households household read access" on public.households;
create policy "households household read access" on public.households for select
  using (id = (select household_id from public.household_members
               where user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. delete a household when its last member leaves  (D6)
--    SECURITY DEFINER: households has no DELETE policy, so a normal user can't
--    do this directly. Cascades wipe categories / pots / periods / transactions
--    / fixed_expenses / invites / household_settings.
--    NOTE: the app copy for leave / remove / switch-household now says the data
--    is deleted (it previously promised it wasn't).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_empty_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members where household_id = old.household_id
  ) then
    delete from public.households where id = old.household_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_delete_empty_household on public.household_members;
create trigger trg_delete_empty_household
  after delete on public.household_members
  for each row execute function public.delete_empty_household();
