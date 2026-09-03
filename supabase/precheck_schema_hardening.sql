-- Read-only pre-check for the schema-hardening migrations.
-- NOT a migration — kept outside migrations/ so `supabase db push` ignores it.
-- Paste into the Supabase SQL editor and read the result.
--
--   * Every `n` should be 0 before applying 20260904130000_schema_hardening_b.sql.
--   * `zero_txn_amount` may be > 0 — those rows just can't be re-saved from the
--     edit screen (which already requires amount > 0) once the NOT VALID
--     `transactions.amount > 0` check lands. Resolve them (give a real amount or
--     delete) before running the VALIDATE step at the end of part A.
--   * `null_created_at` / `null_updated_at` > 0 means the `set not null` steps in
--     part A would fail — backfill first.

select 'bad_dates'        as metric, count(*) as n
  from transactions where date !~ '^\d{4}-\d{2}-\d{2}$'
union all select 'neg_txn_amount',   count(*) from transactions where amount < 0
union all select 'zero_txn_amount',  count(*) from transactions where amount = 0
union all select 'neg_fixed_amount', count(*) from fixed_expenses where amount < 0
union all select 'neg_spend_limit',  count(*) from pots where spend_limit < 0
union all select 'bad_role',         count(*) from household_members where role not in ('owner','member')
union all select 'bad_status',       count(*) from invites where status not in ('pending','accepted')
union all select 'blank_name', (
  select count(*) from (
    select name from households      where char_length(btrim(name)) not between 1 and 100
    union all select name from categories     where char_length(btrim(name)) not between 1 and 100
    union all select name from pots            where char_length(btrim(name)) not between 1 and 100
    union all select name from fixed_expenses  where char_length(btrim(name)) not between 1 and 100
  ) b)
union all select 'keyword_not_lower', count(*) from merchant_map where keyword <> lower(keyword)
union all select 'dup_month_key', (
  select count(*) from (
    select household_id, month_key from periods group by 1, 2 having count(*) > 1) d)
union all select 'xhh_category', count(*)
  from transactions t join categories c on c.id = t.category_id
  where c.household_id <> t.household_id
union all select 'xhh_period', count(*)
  from transactions t join periods p on p.id = t.period_id
  where p.household_id <> t.household_id
union all select 'xhh_pot', count(*)
  from transactions t join pots po on po.id = t.pot_id
  where po.household_id <> t.household_id
union all select 'xhh_fixed_expense', count(*)
  from transactions t join fixed_expenses fe on fe.id = t.fixed_expense_id
  where fe.household_id <> t.household_id
union all select 'xhh_merchant_map', count(*)
  from merchant_map m join categories c on c.id = m.category_id
  where c.household_id <> m.household_id
union all select 'null_created_at', (
  select count(*) from (
    select created_at from categories     union all select created_at from pots
    union all select created_at from fixed_expenses union all select created_at from periods
    union all select created_at from transactions  union all select created_at from households
    union all select created_at from merchant_map  union all select created_at from invites
  ) x where created_at is null)
union all select 'null_updated_at', (
  select count(*) from (
    select updated_at from categories union all select updated_at from pots
    union all select updated_at from fixed_expenses union all select updated_at from merchant_map
  ) x where updated_at is null)
order by metric;
