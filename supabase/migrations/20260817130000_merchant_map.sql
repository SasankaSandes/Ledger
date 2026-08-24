-- Merchant memory: a learned keyword -> pot mapping so quick-add's
-- inferred pot gets smarter with repeated use ("the tenth 'Keells' is
-- instant"). keyword is the first word of a typed description, lowercased
-- (see src/lib/merchantRouting.ts).
--
-- pot_id is NOT a real foreign key: pots live as a jsonb array inside
-- household_settings.pots / budgets.pots, not a Postgres table. It's typed
-- text (not uuid) because PotDef.id comes from uid()
-- (Math.random().toString(36).slice(2, 9)), a short base36 string. A
-- mapping can go dangling if its pot is later deleted from Manage —
-- inferPot() filters matches against the household's current pot list
-- rather than trusting pot_id blindly.
--
-- unique (household_id, keyword) makes "reinforce or create" a simple
-- select-then-update-or-insert by keyword.
create table merchant_map (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  keyword text not null,
  pot_id text not null,
  hit_count int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (household_id, keyword)
);

alter table merchant_map enable row level security;

create policy "members can read/write their household merchant_map"
on merchant_map for all
using (is_household_member(household_id));
