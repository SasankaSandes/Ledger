import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { FixedExpenseEditor } from "@/components/manage/FixedExpenseEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { loadCards } from "@/lib/cards";
import { useHideTabBar } from "@/lib/useHideTabBar";
import {
  FIXED_EXPENSE_COLUMNS,
  categoryFromRow,
  fixedExpenseDefFromRow,
  type Card,
  type Category,
  type FixedExpenseDef,
} from "@/lib/types";

export default function FixedExpensesScreen() {
  useHideTabBar();
  const { householdId } = useHousehold();
  const [outCategories, setOutCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseDef[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const [{ data: catData }, { data: fixedData }, cardList] = await Promise.all([
      supabase
        .from("categories")
        .select("id, household_id, name, type, archived_at")
        .eq("household_id", householdId)
        .eq("type", "out")
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("fixed_expenses")
        .select(FIXED_EXPENSE_COLUMNS)
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      loadCards(supabase, householdId),
    ]);
    setOutCategories((catData ?? []).map(categoryFromRow));
    setCards(cardList);
    setFixedExpenses((fixedData ?? []).map(fixedExpenseDefFromRow));
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

        <Text className="mb-5 font-display text-[22px] text-text">Fixed expenses</Text>

        <FixedExpenseEditor
          householdId={householdId}
          outCategories={outCategories}
          cards={cards}
          items={fixedExpenses}
          onChange={setFixedExpenses}
        />
      </View>
    </Screen>
  );
}
