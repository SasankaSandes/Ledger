import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { JoinHouseholdForm } from "@/components/household/JoinHouseholdForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { createSoloHousehold } from "@/lib/supabase/queries";

// Reachable once leave/removal exist — a signed-in user can end up with
// zero household memberships mid-session, not just at signup. Top-level
// screen (not nested under (tabs)), so no useHideTabBar() needed here.
export default function NoHouseholdScreen() {
  const { refresh } = useHousehold();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await createSoloHousehold(supabase);
      await refresh(); // householdId becomes non-null -> root guard moves on
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a household.");
      setCreating(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="mb-2 font-display text-2xl text-text">No household yet</Text>
        <Text className="mb-6 text-center text-[13px] leading-5 text-muted">
          Create a new household of your own, or join one with an invite code.
        </Text>

        {mode === "choose" ? (
          <View className="w-full max-w-[320px] gap-3">
            <Pressable onPress={create} disabled={creating} className="items-center rounded-lg bg-gold py-3">
              <Text className="font-body-semibold text-[14px] text-on-gold">
                {creating ? "Creating…" : "Create a new household"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setMode("join")} className="items-center rounded-lg border border-line/15 py-3">
              <Text className="font-body-semibold text-[14px] text-muted">Join with a code</Text>
            </Pressable>
          </View>
        ) : (
          <View className="w-full max-w-[320px] gap-3">
            <JoinHouseholdForm warnBeforeSwitch={false} onJoined={() => refresh()} />
            <Pressable onPress={() => setMode("choose")}>
              <Text className="text-center text-[12.5px] text-muted2">Back</Text>
            </Pressable>
          </View>
        )}

        {error && <Text className="mt-3 text-[12.5px] text-negative">{error}</Text>}

        <Pressable onPress={() => signOut()} className="mt-8">
          <Text className="text-[12.5px] text-muted2">Log out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
