-- Unified "pot" domain model + per-member theme preference.
--
-- Collapses the old separate "budget category" (plain spending, capped) and
-- "monthly allowance" (spending + claimable cash-out) concepts into one
-- pot shape: {id, name, cap, cashable, cashoutCap}. A pot is cashable or
-- not; there's no longer a separate type to pick. Annual allowances are
-- unchanged in spirit (still a yearly pool via allowance_periods) but move
-- into their own household_settings.annual_allowances list now that
-- "allowances" no longer means "monthly, cashable pot."
--
-- No production data exists in this project yet (confirmed before writing
-- this), so this backfills once and drops the old columns outright rather
-- than leaving them dead — nothing is at stake, and a still-evolving
-- pre-launch schema is better served by one unambiguous shape.

alter table household_settings add column pots jsonb not null default '[]';
alter table household_settings add column annual_allowances jsonb not null default '[]';
alter table budgets add column pots jsonb not null default '[]';
alter table household_members add column preferences jsonb not null default '{}';

-- household_settings backfill:
--   budget[]                    -> pots (cashable:false)
--   allowances[period=monthly]  -> pots (cashable:true)
--   allowances[period=annual]   -> annual_allowances
update household_settings set
  pots = coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', b->>'id',
       'name', b->>'name',
       'cap', (b->>'amount')::numeric,
       'cashable', false,
       'cashoutCap', null
     ))
     from jsonb_array_elements(budget) as b),
    '[]'::jsonb
  ) || coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', a->>'id',
       'name', a->>'name',
       'cap', (a->>'amount')::numeric,
       'cashable', true,
       'cashoutCap', (a->>'cashoutCap')::numeric
     ))
     from jsonb_array_elements(allowances) as a
     where a->>'period' = 'monthly'),
    '[]'::jsonb
  ),
  annual_allowances = coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', a->>'id',
       'name', a->>'name',
       'amount', (a->>'amount')::numeric,
       'cashoutCap', (a->>'cashoutCap')::numeric
     ))
     from jsonb_array_elements(allowances) as a
     where a->>'period' = 'annual'),
    '[]'::jsonb
  );

-- budgets (period instances) backfill: same reshape, folding item lists —
--   budget[].items                              -> pots[].spendItems
--   allowances[period=monthly].usageItems        -> pots[].spendItems
--   allowances[period=monthly].cashoutItems      -> pots[].cashoutItems
update budgets set
  pots = coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', b->>'id',
       'name', b->>'name',
       'cap', (b->>'amount')::numeric,
       'cashable', false,
       'cashoutCap', null,
       'spendItems', coalesce(b->'items', '[]'::jsonb),
       'cashoutItems', '[]'::jsonb
     ))
     from jsonb_array_elements(budget) as b),
    '[]'::jsonb
  ) || coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', a->>'id',
       'name', a->>'name',
       'cap', (a->>'amount')::numeric,
       'cashable', true,
       'cashoutCap', (a->>'cashoutCap')::numeric,
       'spendItems', coalesce(a->'usageItems', '[]'::jsonb),
       'cashoutItems', coalesce(a->'cashoutItems', '[]'::jsonb)
     ))
     from jsonb_array_elements(allowances) as a
     where a->>'period' = 'monthly'),
    '[]'::jsonb
  );

alter table household_settings drop column budget;
alter table household_settings drop column allowances;
alter table budgets drop column budget;
alter table budgets drop column allowances;
