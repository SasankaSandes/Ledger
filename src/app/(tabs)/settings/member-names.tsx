import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { MemberNicknamesEditor } from "@/components/manage/MemberNicknamesEditor";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { useHideTabBar } from "@/lib/useHideTabBar";
import { listHouseholdMembers, type HouseholdMember } from "@/lib/supabase/queries";

export default function MemberNamesScreen() {
  useHideTabBar();
  const { householdId, nicknames, setNicknames } = useHousehold();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    // `loading` starts true and this only runs once on mount, so there's no
    // need to re-set it here (and doing so synchronously in the effect trips
    // the react-hooks/set-state-in-effect lint rule).
    try {
      setMembers(await listHouseholdMembers(supabase, householdId));
    } finally {
      setLoading(false);
    }
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

        <Text className="mb-1 font-display text-[22px] text-text">Member names</Text>
        <Text className="mb-5 text-[11px] text-muted2">
          Only you see these. Used to label who added each entry in Activity.
        </Text>

        <MemberNicknamesEditor
          members={members}
          myId={myId}
          nicknames={nicknames}
          onChange={setNicknames}
        />
      </View>
    </Screen>
  );
}
