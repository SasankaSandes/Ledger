import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThemePreference } from "@/lib/theme/tokens";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type Membership = {
  householdId: string;
  role: "owner" | "member";
  themePreference: ThemePreference;
};

// Every signup gets exactly one household via the on_auth_user_created
// trigger, so one membership row per user is the expected shape for this
// milestone — shared multi-member households are a Roadmap item.
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
