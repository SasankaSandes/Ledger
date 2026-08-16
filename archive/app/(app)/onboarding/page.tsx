import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("No household found for this user.");
  }

  const householdId = membership.household_id as string;

  const { data: settingsRow } = await supabase
    .from("household_settings")
    .select("onboarded_at")
    .eq("household_id", householdId)
    .maybeSingle();

  if (settingsRow?.onboarded_at) {
    redirect("/dashboard");
  }

  return <OnboardingWizard householdId={householdId} />;
}
