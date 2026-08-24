import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { CategoryEditor } from "@/components/manage/CategoryEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { useHideTabBar } from "@/lib/useHideTabBar";
import { categoryFromRow, type Category } from "@/lib/types";

export default function CategoriesScreen() {
  useHideTabBar();
  const { householdId } = useHousehold();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const { data } = await supabase
      .from("categories")
      .select("id, household_id, name, type, archived_at")
      .eq("household_id", householdId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    setCategories((data ?? []).map(categoryFromRow));
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

        <Text className="mb-1 font-display text-[22px] text-text">Categories</Text>
        <Text className="mb-5 text-[11px] text-muted2">
          Tags for organizing and filtering — they don't carry a limit.
        </Text>

        <CategoryEditor householdId={householdId} items={categories} onChange={setCategories} />
      </View>
    </Screen>
  );
}
