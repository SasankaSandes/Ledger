-- Keyword map: merchant_map, generalised.
--
-- What it is
--   A learned "first word of the note -> category (+ pot)" memory, per
--   household. "keells groceries" -> Groceries / Daily. The keyword is not
--   necessarily a merchant ("lunch", "petrol", "salary" all work), so the table
--   is renamed keyword_map, and it now remembers a pot as well as a category.
--   Quick Add reads it to suggest both while you type the note, and rewrites
--   the row on every confirmed entry with a note (last choice wins, exactly as
--   the category already did).
--
-- What changes
--   1. merchant_map -> keyword_map. Rename only: data, RLS, triggers and
--      constraints carry over; their names are renamed to match.
--   2. keyword_map.pot_id (nullable FK -> pots, set null on delete) plus a check
--      that only Cash Out rows carry one. null means "no pot" (a real answer:
--      if you usually skip the pot for a keyword, that is what's suggested).
--   3. The same-household trigger now covers pot_id too, like it does for
--      category_id.
--   4. Reverse learning: the map is seeded from your existing transactions, so
--      suggestions work on day one instead of after weeks of new entries.
--
-- Reverse learning rules (what counts as "you typed this")
--   * Cash In / Cash Out only. Card payments have no note worth learning.
--   * Skips rows posted from a fixed expense (their description is the fixed
--     expense's name, not something typed) and rows whose description is just
--     the category's own name (that is Quick Add's fallback when the note is
--     left empty).
--   * Skips archived categories; a pot that is archived counts as "no pot".
--   * Per (household, type, keyword): the most-used category wins (ties: most
--     recent date), then the most-used pot within that category (ties: most
--     recent; "no pot" competes like any other value).
--   * Rows that already exist keep their category and hit_count (bumped up to
--     the historical count if that is larger); they only gain a pot when they
--     had none and the history agrees on the category.
--
-- Safely re-runnable, same as the previous migrations: paste it into the
-- Supabase SQL Editor and re-run after a partial failure if needed. Apply it
-- BEFORE running the app build that reads keyword_map.
-- Apply after 20260925120000_credit_cards.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. merchant_map -> keyword_map
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.merchant_map') is not null
     and to_regclass('public.keyword_map') is null then
    alter table public.merchant_map rename to keyword_map;
  end if;
end $$;

-- Dependent object names follow the table, so \d output and error messages
-- don't keep saying merchant_map.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.keyword_map'::regclass
      and contype in ('p', 'u', 'f', 'c')
      and conname like 'merchant\_map\_%'
  loop
    execute format('alter table public.keyword_map rename constraint %I to %I',
                   r.conname, replace(r.conname, 'merchant_map', 'keyword_map'));
  end loop;

  for r in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'keyword_map'
      and indexname like 'merchant\_map\_%'
  loop
    execute format('alter index public.%I rename to %I',
                   r.indexname, replace(r.indexname, 'merchant_map', 'keyword_map'));
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'keyword_map'
      and policyname = 'merchant_map household access'
  ) then
    alter policy "merchant_map household access" on public.keyword_map
      rename to "keyword_map household access";
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pot_id
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.keyword_map
  add column if not exists pot_id uuid references public.pots(id) on delete set null;

create index if not exists keyword_map_pot_id_idx on public.keyword_map(pot_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keyword_map'::regclass and conname = 'keyword_map_pot_only_out'
  ) then
    alter table public.keyword_map
      add constraint keyword_map_pot_only_out check (pot_id is null or type = 'out');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. same-household integrity, now including the pot
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_merchant_map_same_household on public.keyword_map;
drop trigger if exists trg_keyword_map_same_household on public.keyword_map;

create or replace function public.assert_keyword_map_same_household()
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
  if new.pot_id is not null then
    select household_id into hh from public.pots where id = new.pot_id;
    if found and hh <> new.household_id then
      raise exception 'pot % belongs to another household', new.pot_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_keyword_map_same_household
  before insert or update on public.keyword_map
  for each row execute function public.assert_keyword_map_same_household();

drop function if exists public.assert_merchant_map_same_household();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. reverse learning from existing transactions
-- ─────────────────────────────────────────────────────────────────────────────
with usable as (
  select
    t.household_id,
    t.type,
    (regexp_match(lower(t.description), '\S+'))[1] as keyword,
    t.category_id,
    case when p.id is not null and p.archived_at is null then t.pot_id end as pot_id,
    t.date
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.archived_at is null
  left join public.pots p on p.id = t.pot_id
  where t.type in ('in', 'out')
    and t.fixed_expense_id is null
    and btrim(t.description) <> ''
    and lower(btrim(t.description)) <> lower(btrim(c.name))
),
by_category as (
  select household_id, type, keyword, category_id,
         count(*) as n, max(date) as last_seen
  from usable
  group by household_id, type, keyword, category_id
),
category_rank as (
  select *,
         sum(n) over (partition by household_id, type, keyword) as total,
         row_number() over (partition by household_id, type, keyword
                            order by n desc, last_seen desc) as rn
  from by_category
),
by_pot as (
  select household_id, type, keyword, category_id, pot_id,
         count(*) as n, max(date) as last_seen
  from usable
  group by household_id, type, keyword, category_id, pot_id
),
pot_rank as (
  select *,
         row_number() over (partition by household_id, type, keyword, category_id
                            order by n desc, last_seen desc) as rn
  from by_pot
)
insert into public.keyword_map (household_id, type, keyword, category_id, pot_id, hit_count)
select w.household_id, w.type, w.keyword, w.category_id,
       case when w.type = 'out' then pr.pot_id end,
       w.total
from category_rank w
join pot_rank pr
  on  pr.household_id = w.household_id
  and pr.type         = w.type
  and pr.keyword      = w.keyword
  and pr.category_id  = w.category_id
  and pr.rn = 1
where w.rn = 1
on conflict (household_id, type, keyword) do update
set pot_id = case
                when keyword_map.pot_id is null
                 and keyword_map.type = 'out'
                 and keyword_map.category_id = excluded.category_id
                then excluded.pot_id
                else keyword_map.pot_id
             end,
    hit_count = greatest(keyword_map.hit_count, excluded.hit_count);
