# Ledger schema audit

Full review of `supabase/migrations/*` as of `20260903120000`. Findings are
ordered by severity. Each has **what / why it matters / fix**. A consolidated
remediation migration is sketched at the end.

Live-DB checks done via the anon REST API: `budgets`, `savings_collections`,
`debts`, `allowance_periods` are confirmed dropped. Everything else is inferred
from the migration files and should be re-confirmed against the live DB with
`\d+ <table>` / `information_schema` before applying fixes.

---

## Resolution status

Every finding is addressed by the schema-hardening migrations. Run
`supabase/precheck_schema_hardening.sql` first.

| Finding | Fixed in |
|---|---|
| S1 anon-executable RPCs | `20260904120000_schema_hardening_a.sql` §7 |
| S2 cross-household refs | `20260904130000_schema_hardening_b.sql` §3 (BEFORE triggers) |
| S3 invites never expire | A §5 (`expires_at` column + `redeem_invite` rejects expired codes) |
| D1 unmaintained `updated_at` | A §1–2 (`set_row_updated` trigger) + client drops manual sets |
| D2 no `amount` check | A §4 (`amount > 0` NOT VALID) + `FixedExpensesSection` gates Confirm |
| D3 no `role`/`status` check | A §4 |
| D4 `date` is `text` | B §1 |
| D5 duplicate `month_key` | B §2 |
| D6 orphan households | B §5 (`delete_empty_household` trigger) + `JoinHouseholdForm` copy |
| H1 no `created_by` | A §2 |
| H2 no `updated_by` | A §1–2 |
| H3 nullable `created_at` | A §3 |
| P1 per-row RLS fn call | B §4 |
| P2 missing FK indexes | A §6 |
| P3 bare `auth.uid()` | B §4 (folded in) |
| M1 unbounded names | A §4 |
| M2 `invited_by`/`accepted_by` on-delete | A §5 |
| M3 `keyword` not lowercased | A §4 |
| M4 non-idempotent old migrations | not retrofitted — new files are idempotent; old ones are applied |
| M5 misleading composite PK | not changed — cosmetic |
| M6 `handle_new_user` blocks signup | A §8 |

---

## What's already sound (so the fixes below don't undo it)

- RLS is enabled on every table, scoped through `is_household_member()` /
  `is_household_owner()`.
- Every `SECURITY DEFINER` function sets `search_path = public` (no search-path
  injection).
- `periods_one_open_per_household` partial unique index enforces "one open
  period" at the DB, not just the app.
- `household_members_one_per_user` unique constraint is a real backstop for
  "one household per user".
- `redeem_invite()` is atomic and takes `FOR UPDATE` on the invite row.
- `prevent_self_role_change()` trigger stops a member self-promoting to owner.
- Membership INSERT has *no* policy — rows only come from `SECURITY DEFINER`
  paths. Correct default-deny.

---

## Security

### S1 — `SECURITY DEFINER` RPCs are almost certainly executable by `anon`
**What.** Postgres grants `EXECUTE` on new `public` functions to `PUBLIC`
(so `anon` + `authenticated`) by default. No migration ever `REVOKE`s it. That
exposes `create_solo_household()`, `redeem_invite()`, `list_household_members()`,
`generate_invite_code()`, `is_household_member()`, `is_household_owner()`,
`handle_new_user()` to unauthenticated callers.
**Why.** `redeem_invite()` runs as definer, so an anonymous caller can reach the
invite lookup and distinguish "invalid code" from "valid code" by the error it
gets back (the insert then fails on the NOT-NULL `user_id`, but the probe
already happened) — invite-code enumeration. `generate_invite_code()` is a
callable no-auth CPU/DB tick. The others fail safe but shouldn't be reachable.
**Fix.** `REVOKE EXECUTE ... FROM anon, public` on the RPCs; `GRANT EXECUTE ... TO
authenticated` only where the app calls them. Leave `is_household_member` /
`is_household_owner` grants intact (RLS policy evaluation needs `authenticated`
to hold EXECUTE — revoking there breaks every policy).

### S2 — cross-household references are not enforced
**What.** `transactions` requires `household_id` membership via RLS, but nothing
checks that its `period_id` / `category_id` / `pot_id` / `fixed_expense_id`
belong to the *same* household. Same for `merchant_map.category_id`.
**Why.** A member of household A who learns a `category_id` from household B can
insert a transaction in A that points at B's category. B can't see it (RLS
filters by `household_id`), and A sees a row whose category renders as "—", but
it's a referential-integrity hole and a data-poisoning vector.
**Fix.** Composite FKs — add `unique (household_id, id)` to `categories` /
`periods` / `pots` / `fixed_expenses`, then
`foreign key (household_id, category_id) references categories (household_id, id)`
on the child. Or a `BEFORE INSERT/UPDATE` trigger asserting the parents'
`household_id` matches. Composite FK is the cleaner, index-backed option.

### S3 — invite codes never expire
**What.** `invites` has no `expires_at`. A code is valid until redeemed or
manually revoked.
**Why.** Codes are 6 chars over a 31-char alphabet. A standing valid code plus
S1's enumeration surface plus no per-owner cap on pending invites is a slow but
real unauthorized-join risk.
**Fix.** `alter table invites add column expires_at timestamptz not null default
now() + interval '7 days'`; add `and i.expires_at > now()` to the `redeem_invite`
lookup; optionally cap pending invites per household.

---

## Data integrity / correctness

### D1 — `updated_at` is a lie
**What.** `categories`, `pots`, `fixed_expenses`, `merchant_map`,
`household_settings` all have `updated_at timestamptz default now()` but **no
`BEFORE UPDATE` trigger**. It's set by hand in *some* client editors
(`CategoryEditor` passes it) and not others (`renameHousehold`,
`setMyThemePreference`, `edit-transaction`'s save, …).
**Why.** The column can't be trusted for "last modified" — sorting, sync,
"what changed recently" all read stale values.
**Fix.** One `set_updated_at()` trigger function, `BEFORE UPDATE` on every table
with the column. Then stop passing `updated_at` from the client.

### D2 — `transactions.amount` has no positivity check
**What.** Column comment says "always positive; sign is implied by `type`", but
there's no `CHECK`.
**Why.** A negative or zero amount (bug, replayed request, crafted body) silently
corrupts *every* derived number — `monthBalance`, `potSpent`, category totals —
with no error and no trace.
**Fix.** `check (amount > 0)` on `transactions`; `check (amount >= 0)` on
`fixed_expenses.amount` and `pots.spend_limit`. (`periods.opening_balance` can
legitimately be negative — leave it.)

### D3 — `role` and `status` have no constraint, only a comment
**What.** `household_members.role text default 'member'` — no `CHECK`.
`invites.status text default 'pending'` — no `CHECK`.
**Why.** `role = 'Owner'` / `'owner '` / `'admin'` all insert fine and silently
fail every `role = 'owner'` comparison — a member who looks like an owner in the
roster but has no owner rights, or vice versa. `status` typos break
`redeem_invite`'s `status = 'pending'` filter.
**Fix.** `check (role in ('owner','member'))`, `check (status in
('pending','accepted'))`. (`transactions.type` / `categories.type` /
`merchant_map.type` already have theirs — this is just closing the gaps.)

### D4 — `transactions.date` is `text`, not `date`
**What.** Stored as `'YYYY-MM-DD'` strings.
**Why.** No validation (`'2026-13-40'`, `'today'` all accepted); relies on ISO
strings happening to sort chronologically; range/interval queries need a cast;
the `transactions_household_date_idx` is a text index.
**Fix.** `alter column date type date using date::date` — after checking every
row parses. `periods.month_key` (a `'YYYY-MM'` key) is more defensible as text
but could be a real `date` pinned to the 1st.

### D5 — duplicate `period.month_key` is possible
**What.** Only `periods_one_open_per_household` (one row with `ended_at is null`)
is enforced. Two *closed* periods can both be `'2026-08'`.
**Why.** `listMonths` would show "August 2026" twice and opening-balance
carry-forward becomes ambiguous.
**Fix.** `unique (household_id, month_key)` (after de-duping any existing rows).

### D6 — orphaned households are undeletable dead data
**What.** `households` has SELECT and owner-UPDATE policies but **no DELETE
policy** (intentional per the comment). When the last member leaves via
`removeMember`, the `households` row plus every cascade child (`categories`,
`pots`, `periods`, `transactions`, `fixed_expenses`, `household_settings`,
`merchant_map`) is orphaned — invisible to everyone (`is_household_member` is
false for all) but never removed.
**Why.** Unbounded dead-data growth; no operator path to reclaim it.
**Fix.** A `SECURITY DEFINER` "leave household" RPC (or an `AFTER DELETE ON
household_members` trigger) that deletes the `households` row when its member
count hits zero — the cascade handles the rest.

---

## Attribution / audit hygiene (the gap that prompted this)

### H1 — no `created_by` on any table except `transactions`
`categories`, `pots`, `fixed_expenses`, `periods`, `merchant_map`, `households`,
`household_settings` record no author. In a shared household there's no way to
answer "who made this pot / who started this month / who added this category".
**Fix.** `add column created_by uuid references auth.users(id) on delete set null
default auth.uid()` on each, matching what `transactions` now has.

### H2 — no `updated_by` anywhere
No table records who *last changed* a row. If you want "edited by \<name\>" in
the UI later, the data isn't being captured now.
**Fix.** `add column updated_by uuid references auth.users(id) on delete set
null`, maintained by the same `set_updated_at()` trigger (`new.updated_by =
auth.uid()`).

### H3 — `created_at` / `updated_at` are nullable
`created_at timestamptz default now()` — a client can still write
`created_at = null`.
**Fix.** `set not null` on all of them (after backfilling any nulls).

---

## Performance (latent — fine at current scale, bites as data grows)

### P1 — RLS calls a function per row
**What.** Policies are `using (is_household_member(household_id))`. `household_id`
varies per row, so the membership subquery runs once per row scanned on
`transactions` etc.
**Fix.** A user is in exactly one household, so:
`using (household_id = (select household_id from household_members where user_id =
(select auth.uid())))` — one subquery, evaluated once per statement.

### P2 — missing indexes on foreign-key columns
Postgres does not auto-index FKs. Unindexed: `fixed_expenses.category_id`,
`transactions.fixed_expense_id`, `transactions.created_by`,
`merchant_map.category_id`, `invites.invited_by`, `invites.accepted_by`.
**Fix.** `create index` on each. Cheap; prevents seq-scans on joins and slow
cascades.

### P3 — bare `auth.uid()` in policy expressions
Supabase guidance: wrap as `(select auth.uid())` so the planner hoists it to an
initplan instead of re-evaluating per row. Folded into the P1 rewrite.

---

## Minor / cosmetic

- **M1.** `households.name`, `categories.name`, `pots.name`,
  `fixed_expenses.name` — unbounded `text`, no non-empty check. Add
  `check (char_length(trim(name)) between 1 and 100)`.
- **M2.** `invites.invited_by` / `accepted_by` → `auth.users(id)` with no
  `ON DELETE` (defaults to `NO ACTION`) — deleting such a user is blocked. Should
  be `on delete set null`.
- **M3.** `merchant_map.keyword` is lowercased by the app, not the DB. Add
  `check (keyword = lower(keyword))` or switch to `citext`.
- **M4.** Migrations are inconsistently idempotent — `20260812120000` uses bare
  `create table`, later ones guard with `if not exists`. The files claim to be
  hand-paste-safe; make them actually so.
- **M5.** `household_members` PK is `(household_id, user_id)` but `unique
  (user_id)` now makes `household_id` redundant for identity — the composite PK
  implies multi-household membership that the unique constraint forbids.
  Documentation-only.
- **M6.** `handle_new_user()` runs in the signup transaction — if it throws, the
  `auth.users` insert rolls back and **signup fails entirely**. Consider making
  the household bootstrap tolerant (log-and-continue) or moving it to a deferred
  path.

---

## Remediation — as shipped

The sketch that used to live here became three files:

- **`supabase/precheck_schema_hardening.sql`** — read-only diagnostics; run first.
- **`supabase/migrations/20260904120000_schema_hardening_a.sql`** — safe /
  additive: the `set_row_updated` trigger, `created_by`/`updated_by`/`updated_at`
  on every household table, CHECK constraints (added `NOT VALID`), invite
  `expires_at` + expiry enforcement in `redeem_invite`, FK indexes, the RPC
  `REVOKE`s, and `handle_new_user` failure isolation.
- **`supabase/migrations/20260904130000_schema_hardening_b.sql`** — touches live
  data: `transactions.date` → `date`, `unique (household_id, month_key)`,
  same-household `BEFORE` triggers (used instead of composite FKs — a composite
  `ON DELETE SET NULL` would try to null the NOT NULL `household_id`), the
  single-subquery RLS rewrite, and the `delete_empty_household` trigger for D6.

Client side: the manage editors and `merchantRouting` stop sending `updated_at`,
`FixedExpensesSection` disables "Confirm" for a still-blank fixed expense, and
`JoinHouseholdForm`'s switch-household warning now says the old household is
deleted when you were its last member.
