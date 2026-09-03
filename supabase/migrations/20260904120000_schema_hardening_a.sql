-- Schema hardening, part A — safe / additive. See docs/SCHEMA_AUDIT.md.
--
-- Everything here is idempotent (if-not-exists / drop-then-create guards) and
-- non-destructive: no table rewrites, no data loss, CHECK constraints added
-- NOT VALID so they never fail on existing rows at apply time. Run
-- supabase/precheck_schema_hardening.sql first; run the VALIDATE section at the
-- bottom only once the relevant pre-check counts are 0.
--
-- Pair: 20260904130000_schema_hardening_b.sql (the parts that touch live data).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. updated_at / updated_by maintenance trigger  (D1, H2)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_row_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();  -- null for service-role / SECURITY DEFINER writes
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. created_by / updated_by / updated_at + trigger on every household table
--    (H1, H2, D1). transactions.created_by already exists (20260903120000).
-- ─────────────────────────────────────────────────────────────────────────────

-- household_settings is the only one of these tables with no created_at — add it
-- first so the updated_at backfill below can COALESCE against it uniformly.
alter table public.household_settings add column if not exists created_at timestamptz not null default now();

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories','pots','fixed_expenses','periods',
    'merchant_map','households','household_settings','transactions'
  ] loop
    execute format(
      'alter table public.%I add column if not exists created_by uuid '
      'references auth.users(id) on delete set null default auth.uid()', t);
    execute format(
      'alter table public.%I add column if not exists updated_by uuid '
      'references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format(
      'update public.%I set updated_at = coalesce(updated_at, created_at, now()) '
      'where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format('alter table public.%I alter column updated_at set not null', t);
    execute format('drop trigger if exists trg_set_row_updated on public.%I', t);
    execute format(
      'create trigger trg_set_row_updated before update on public.%I '
      'for each row execute function public.set_row_updated()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. created_at NOT NULL  (H3) — gated on pre-check null_created_at = 0
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.categories     alter column created_at set not null;
alter table public.pots           alter column created_at set not null;
alter table public.fixed_expenses alter column created_at set not null;
alter table public.periods        alter column created_at set not null;
alter table public.transactions   alter column created_at set not null;
alter table public.households     alter column created_at set not null;
alter table public.merchant_map   alter column created_at set not null;
alter table public.invites        alter column created_at set not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. value / shape CHECK constraints, all NOT VALID  (D2, D3, M1, M3)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.transactions drop constraint if exists transactions_amount_positive;
alter table public.transactions add constraint transactions_amount_positive
  check (amount > 0) not valid;

alter table public.fixed_expenses drop constraint if exists fixed_expenses_amount_nonneg;
alter table public.fixed_expenses add constraint fixed_expenses_amount_nonneg
  check (amount >= 0) not valid;

alter table public.pots drop constraint if exists pots_spend_limit_nonneg;
alter table public.pots add constraint pots_spend_limit_nonneg
  check (spend_limit >= 0) not valid;

alter table public.household_members drop constraint if exists household_members_role_valid;
alter table public.household_members add constraint household_members_role_valid
  check (role in ('owner','member')) not valid;

alter table public.invites drop constraint if exists invites_status_valid;
alter table public.invites add constraint invites_status_valid
  check (status in ('pending','accepted')) not valid;

alter table public.households drop constraint if exists households_name_len;
alter table public.households add constraint households_name_len
  check (char_length(btrim(name)) between 1 and 100) not valid;

alter table public.categories drop constraint if exists categories_name_len;
alter table public.categories add constraint categories_name_len
  check (char_length(btrim(name)) between 1 and 100) not valid;

alter table public.pots drop constraint if exists pots_name_len;
alter table public.pots add constraint pots_name_len
  check (char_length(btrim(name)) between 1 and 100) not valid;

alter table public.fixed_expenses drop constraint if exists fixed_expenses_name_len;
alter table public.fixed_expenses add constraint fixed_expenses_name_len
  check (char_length(btrim(name)) between 1 and 100) not valid;

alter table public.merchant_map drop constraint if exists merchant_map_keyword_lower;
alter table public.merchant_map add constraint merchant_map_keyword_lower
  check (keyword = lower(keyword)) not valid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. invites: expiry + drop-in-place FK on-delete behaviour  (S3, M2)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.invites add column if not exists expires_at timestamptz
  not null default (now() + interval '7 days');

do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.invites'::regclass
      and con.contype = 'f'
      and a.attname in ('invited_by','accepted_by')
  loop
    execute format('alter table public.invites drop constraint %I', c);
  end loop;
end $$;

alter table public.invites add constraint invites_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete set null;
alter table public.invites add constraint invites_accepted_by_fkey
  foreign key (accepted_by) references auth.users(id) on delete set null;

-- redeem_invite now refuses expired codes (unchanged otherwise).
create or replace function public.redeem_invite(code text)
returns table (household_id uuid, household_name text)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  invite_row invites%rowtype;
  normalized_code text := upper(trim(code));
  current_household_id uuid;
  target_name text;
begin
  select i.* into invite_row
  from invites i
  where i.code = normalized_code
    and i.status = 'pending'
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'Invalid, expired, or already-used invite code.';
  end if;

  select hm.household_id into current_household_id
  from household_members hm
  where hm.user_id = auth.uid();

  if current_household_id = invite_row.household_id then
    raise exception 'You are already a member of this household.';
  end if;

  delete from household_members where user_id = auth.uid();

  insert into household_members (household_id, user_id, role)
  values (invite_row.household_id, auth.uid(), 'member');

  update invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite_row.id;

  select h.name into target_name from households h where h.id = invite_row.household_id;

  return query select invite_row.household_id, target_name;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. missing foreign-key indexes  (P2)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists fixed_expenses_category_id_idx  on public.fixed_expenses(category_id);
create index if not exists transactions_fixed_expense_id_idx on public.transactions(fixed_expense_id);
create index if not exists transactions_created_by_idx       on public.transactions(created_by);
create index if not exists merchant_map_category_id_idx      on public.merchant_map(category_id);
create index if not exists invites_invited_by_idx            on public.invites(invited_by);
create index if not exists invites_accepted_by_idx           on public.invites(accepted_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. stop exposing the mutating RPCs to anon  (S1)
--    generate_invite_code stays granted to `authenticated` because it's the
--    column DEFAULT for invites.code and the inserter needs EXECUTE on it.
--    is_household_member / is_household_owner grants are left untouched — RLS
--    policy evaluation needs them.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.create_solo_household(),
  public.redeem_invite(text),
  public.list_household_members(uuid),
  public.generate_invite_code()
from anon, public;

grant execute on function
  public.create_solo_household(),
  public.redeem_invite(text),
  public.list_household_members(uuid),
  public.generate_invite_code()
to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. handle_new_user: don't let a bootstrap failure roll back signup  (M6)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  begin
    insert into households (name, created_by)
      values ('My Household', new.id)
      returning id into new_household_id;
    insert into household_members (household_id, user_id, role)
      values (new_household_id, new.id, 'owner');
  exception when others then
    -- User still gets an account; the app routes them to the "no household"
    -- screen where they can create or join one.
    raise warning 'handle_new_user: household bootstrap failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. VALIDATE the CHECK constraints — RUN ONLY after the pre-check confirms
--    neg_txn_amount / zero_txn_amount / bad_role / bad_status / blank_name /
--    keyword_not_lower are all 0 (resolve any offending rows first). The
--    constraints already apply to every new INSERT/UPDATE without this; VALIDATE
--    just also guarantees existing rows comply.
-- ─────────────────────────────────────────────────────────────────────────────
-- alter table public.transactions      validate constraint transactions_amount_positive;
-- alter table public.fixed_expenses    validate constraint fixed_expenses_amount_nonneg;
-- alter table public.pots              validate constraint pots_spend_limit_nonneg;
-- alter table public.household_members validate constraint household_members_role_valid;
-- alter table public.invites           validate constraint invites_status_valid;
-- alter table public.households        validate constraint households_name_len;
-- alter table public.categories        validate constraint categories_name_len;
-- alter table public.pots              validate constraint pots_name_len;
-- alter table public.fixed_expenses    validate constraint fixed_expenses_name_len;
-- alter table public.merchant_map      validate constraint merchant_map_keyword_lower;
