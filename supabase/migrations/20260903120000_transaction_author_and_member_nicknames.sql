-- Transaction attribution + per-viewer member nicknames.
--
-- Both steps are add-column-if-not-exists, safe to re-run — this script is
-- meant to be pasted into the Supabase SQL Editor by hand, same as the
-- other migrations in this folder.
--
-- No RLS changes: `transactions` keeps its blanket is_household_member
-- policy (covers reads of the new column), and `household_members` already
-- lets a member UPDATE their own row (user_id = auth.uid()), which is the
-- path setMyThemePreference / setMyNicknames use. The
-- prevent_self_role_change trigger only fires on role changes.

-- 1. Author of each transaction. `default auth.uid()` so every existing
--    insert path (quick-add, confirm-fixed-expense) populates it with no
--    client change. `on delete set null` keeps the transaction if the
--    author's auth user is ever removed. Rows created before this migration
--    stay null — unknowable retroactively; the UI shows no author for them.
alter table transactions
  add column if not exists created_by uuid
  references auth.users(id) on delete set null default auth.uid();

-- 2. Per-viewer private nicknames. Each member's own row holds a
--    { "<memberUserId>": "<nickname>" } map that only they read and write.
--    A dedicated column, not a key inside `preferences`, because
--    setMyThemePreference replaces the whole `preferences` object and would
--    otherwise clobber this.
alter table household_members
  add column if not exists nicknames jsonb not null default '{}';
