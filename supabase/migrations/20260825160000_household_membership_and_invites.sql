-- In-app invite codes + owner-only household management.
--
-- Splits the single blanket "members can do anything" policy on
-- household_members/invites (and, since "owner-only rename" implies it,
-- households too) into read-open/write-owner-gated policies. All shared
-- ledger data (categories/pots/transactions/periods/...) keeps its
-- existing blanket is_household_member policy unchanged — only household
-- *membership* itself gets tighter rules.
--
-- Any mutation that crosses a household boundary the caller isn't yet a
-- member of (joining someone else's household, bootstrapping a fresh solo
-- one) has to go through a SECURITY DEFINER RPC, same idiom as the
-- existing handle_new_user() trigger — a plain client insert/update can
-- never do this, by design.

alter table household_members add column if not exists joined_at timestamptz not null default now();

-- Hard guarantee behind "zero-or-one household per user": catches any bug
-- (including a double-tap race on create_solo_household) that would
-- otherwise leave someone in two households at once. If this fails to
-- apply because dev/test data already has a duplicate, dedupe manually
-- first — the live app has never had a way to create one, so this should
-- be a no-op in practice.
alter table household_members add constraint household_members_one_per_user unique (user_id);

-- Mirrors is_household_member exactly, but checks role='owner'.
create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = target_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Short, human-typeable invite codes: uppercase letters/digits, excluding
-- 0/O and 1/I so a code read aloud or copied by hand can't be
-- misheard/mistyped.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
begin
  loop
    candidate := (
      select string_agg(substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    attempts := attempts + 1;
    exit when not exists (select 1 from invites where code = candidate);
    if attempts > 20 then
      raise exception 'Could not generate a unique invite code — try again.';
    end if;
  end loop;
  return candidate;
end;
$$;

-- invites: code-based redemption columns. `email` is left nullable/unused
-- rather than dropped — zero-cost, keeps the door open for an emailed
-- variant later without another migration.
alter table invites add column if not exists code text;
alter table invites add column if not exists accepted_by uuid references auth.users(id);
alter table invites add column if not exists accepted_at timestamptz;

update invites set code = public.generate_invite_code() where code is null;

alter table invites alter column code set not null;
alter table invites alter column code set default public.generate_invite_code();
alter table invites alter column email drop not null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'invites' and constraint_name = 'invites_code_key'
  ) then
    alter table invites add constraint invites_code_key unique (code);
  end if;
end $$;

create index if not exists invites_household_status_idx on invites(household_id, status);

-- === RLS: households ===
-- Was one blanket policy (any member could rename OR delete). Split so
-- rename is owner-only and delete has no policy at all (household
-- deletion is explicitly out of scope for v1 — default-deny is correct).
drop policy if exists "members can read/write their household" on households;

create policy "members can read their household"
on households for select
using (is_household_member(id));

create policy "owner can rename their household"
on households for update
using (is_household_owner(id))
with check (is_household_owner(id));

-- === RLS: household_members ===
-- SELECT stays open to any member (roster needs to be visible). UPDATE/
-- DELETE: self OR owner (self-leave, self preference update, owner
-- removing someone else). No INSERT policy at all — rows are only ever
-- created by handle_new_user() or redeem_invite() (both SECURITY
-- DEFINER, bypass RLS); a permissive insert policy would let anyone add
-- themselves to any household_id they can guess.
drop policy if exists "members can read/write their membership rows" on household_members;

create policy "members can read their household roster"
on household_members for select
using (is_household_member(household_id));

create policy "self or owner can update a membership row"
on household_members for update
using (user_id = auth.uid() or is_household_owner(household_id))
with check (user_id = auth.uid() or is_household_owner(household_id));

create policy "self or owner can remove a membership row"
on household_members for delete
using (user_id = auth.uid() or is_household_owner(household_id));

-- Closes a hole the policy above opens on its own: "self can update own
-- row" would otherwise let a member silently promote themselves by
-- setting role='owner' on their own row. Only fires when role actually
-- changes, so the self theme-preference update path is untouched.
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_household_owner(old.household_id) then
    raise exception 'Only the household owner can change a member''s role.';
  end if;
  return new;
end;
$$;

drop trigger if exists household_members_guard_role on household_members;
create trigger household_members_guard_role
  before update on household_members
  for each row execute function public.prevent_self_role_change();

-- === RLS: invites ===
-- SELECT open to any member (transparency). INSERT/DELETE owner-only
-- (create a code / revoke a pending one). No UPDATE policy — status/
-- accepted_by/accepted_at only ever change inside redeem_invite() below.
drop policy if exists "members can read/write their household invites" on invites;

create policy "members can read their household invites"
on invites for select
using (is_household_member(household_id));

create policy "owner can create invites"
on invites for insert
with check (is_household_owner(household_id));

create policy "owner can revoke invites"
on invites for delete
using (is_household_owner(household_id));

-- Redeem an invite code: swaps the caller's membership atomically,
-- server-side. Always deletes any existing membership row for the caller
-- first — defensively, not just when the client's warning dialog was
-- shown, since this RPC is the single real enforcement point.
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
  where i.code = normalized_code and i.status = 'pending'
  for update;

  if not found then
    raise exception 'Invalid or already-used invite code.';
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

-- Member roster with identities. auth.users isn't queryable by clients
-- directly, so this joins it server-side as SECURITY DEFINER — same idiom
-- as handle_new_user(). Re-checks membership explicitly since it's a
-- directly callable RPC, not gated by the household_members SELECT policy
-- the way a plain table query would be.
create or replace function public.list_household_members(target_household_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_household_member(target_household_id) then
    raise exception 'Not a member of this household.';
  end if;

  return query
    select hm.user_id, au.email::text, hm.role, hm.joined_at
    from household_members hm
    join auth.users au on au.id = hm.user_id
    where hm.household_id = target_household_id
    order by (hm.role = 'owner') desc, hm.joined_at asc;
end;
$$;

-- Bootstraps a fresh solo household for a signed-in user with zero
-- memberships — reachable now that leave/remove exist. Mirrors
-- handle_new_user()'s insert pair; guarded against double-calls.
create or replace function public.create_solo_household()
returns uuid
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  new_household_id uuid;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household.';
  end if;

  insert into households (name) values ('My Household') returning id into new_household_id;
  insert into household_members (household_id, user_id, role) values (new_household_id, auth.uid(), 'owner');

  return new_household_id;
end;
$$;
