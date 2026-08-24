import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThemePreference } from "@/lib/theme/tokens";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type Membership = {
  householdId: string;
  role: "owner" | "member";
  themePreference: ThemePreference;
};

// Zero-or-one membership row per user, enforced by construction: the
// household_members_one_per_user unique constraint backs it, and the only
// ways a row is created — handle_new_user() at signup, create_solo_household(),
// redeem_invite() — only ever insert when the caller has none.
export async function getMyMembership(supabase: Client, userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role, preferences")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const prefs = (data.preferences ?? {}) as { theme?: ThemePreference };
  return {
    householdId: data.household_id,
    role: data.role,
    themePreference: prefs.theme ?? "dark", // missing key means dark, not "system"
  };
}

export async function setMyThemePreference(
  supabase: Client,
  householdId: string,
  userId: string,
  theme: ThemePreference
) {
  const { error } = await supabase
    .from("household_members")
    .update({ preferences: { theme } })
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Categories/fixed expenses/periods/transactions are real tables now, loaded
// per-screen rather than centrally cached — household_settings only still
// answers "has this household finished onboarding."
export async function getOnboarded(supabase: Client, householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("household_settings")
    .select("onboarded_at")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.onboarded_at;
}

export type HouseholdMember = {
  userId: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
};

// auth.users isn't queryable by clients directly, so the roster comes from
// a SECURITY DEFINER RPC that joins it server-side (same idiom as
// is_household_member/handle_new_user).
export async function listHouseholdMembers(supabase: Client, householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase.rpc("list_household_members", { target_household_id: householdId });
  if (error) throw error;
  return (data ?? []).map((row: { user_id: string; email: string; role: "owner" | "member"; joined_at: string }) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

// Cheap headcount for the Settings hub's "N members" subtitle — a HEAD
// request with count:"exact" returns just the count, no rows, no
// auth.users join, so it's much lighter than listHouseholdMembers.
export async function getHouseholdMemberCount(supabase: Client, householdId: string): Promise<number> {
  const { count, error } = await supabase
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) throw error;
  return count ?? 0;
}

export type RedeemedHousehold = { householdId: string; householdName: string };

// Joining a household you're not yet a member of has to go through this
// RPC — a plain client insert into household_members would be rejected by
// RLS, since is_household_member is false for you pre-join, by design.
export async function redeemInvite(supabase: Client, code: string): Promise<RedeemedHousehold> {
  const { data, error } = await supabase.rpc("redeem_invite", { code }).single();
  if (error) throw error;
  const row = data as { household_id: string; household_name: string };
  return { householdId: row.household_id, householdName: row.household_name };
}

// Bootstraps a fresh solo household for a signed-in user with zero
// memberships (reachable via leave/removal) — mirrors what
// handle_new_user() does at signup.
export async function createSoloHousehold(supabase: Client): Promise<string> {
  const { data, error } = await supabase.rpc("create_solo_household");
  if (error) throw error;
  return data as string;
}

export type PendingInvite = { id: string; code: string; createdAt: string };

// Plain insert, not an RPC — the owner-only INSERT policy on invites
// enforces this at the DB level, and `code` fills itself via the column
// default (generate_invite_code()).
export async function createInvite(supabase: Client, householdId: string, invitedBy: string): Promise<PendingInvite> {
  const { data, error } = await supabase
    .from("invites")
    .insert({ household_id: householdId, invited_by: invitedBy })
    .select("id, code, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, code: data.code, createdAt: data.created_at };
}

export async function listPendingInvites(supabase: Client, householdId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("id, code, created_at")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, code: r.code, createdAt: r.created_at }));
}

// Revoke = delete, not a status flip — invites.status only ever means
// pending/accepted; a revoked code has no ongoing purpose to keep a row
// for. Owner-only DELETE policy enforces this at the DB level.
export async function revokeInvite(supabase: Client, inviteId: string): Promise<void> {
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) throw error;
}

// Same call for "owner removes someone else" and "member leaves" — the
// self-or-owner DELETE policy on household_members covers both, so there's
// no need for two functions or an RPC.
export async function removeMember(supabase: Client, householdId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("household_members").delete().eq("household_id", householdId).eq("user_id", userId);
  if (error) throw error;
}

export async function renameHousehold(supabase: Client, householdId: string, name: string): Promise<void> {
  const { error } = await supabase.from("households").update({ name }).eq("id", householdId);
  if (error) throw error;
}

export async function getHouseholdName(supabase: Client, householdId: string): Promise<string> {
  const { data, error } = await supabase.from("households").select("name").eq("id", householdId).single();
  if (error) throw error;
  return data.name;
}
