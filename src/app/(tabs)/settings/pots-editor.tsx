import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { PotEditor } from "@/components/manage/PotEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { useHideTabBar } from "@/lib/useHideTabBar";
import { potFromRow, type Pot } from "@/lib/types";

// Filename avoids "pots.tsx" purely to keep it visually distinct from the
// top-level Pots tab (`src/app/(tabs)/pots.tsx`, a browsing/summary view)
// in the file tree — the routes don't actually collide (`/settings/pots`
// vs `/pots`). On-screen title still just reads "Pots".
export default function PotsEditorScreen() {
  useHideTabBar();
  const { householdId } = useHousehold();
  const [pots, setPots] = useState<Pot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const { data } = await supabase
      .from("pots")
      .select("id, household_id, name, spend_limit, archived_at")
      .eq("household_id", householdId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    setPots((data ?? []).map(potFromRow));
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !householdId) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="px-[18px] pb-[60px] pt-7">
        <Pressable onPress={() => router.back()} hitSlop={8} className="mb-3 flex-row items-center gap-1">
          <Text className="text-[13px] text-muted">‹ Back</Text>
        </Pressable>

        <Text className="mb-1 font-display text-[22px] text-text">Pots</Text>
        <Text className="mb-5 text-[11px] text-muted2">
          Budgets with a spend limit — assign any Cash Out transaction to one when you log it.
        </Text>

        <PotEditor householdId={householdId} items={pots} onChange={setPots} />
      </View>
    </Screen>
  );
}
