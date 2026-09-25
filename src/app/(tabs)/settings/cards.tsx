import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { CardEditor } from "@/components/manage/CardEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { loadCardBalances, loadCards } from "@/lib/cards";
import { useHideTabBar } from "@/lib/useHideTabBar";
import type { Card, CardBalance } from "@/lib/types";

export default function CardsEditorScreen() {
  useHideTabBar();
  const { householdId } = useHousehold();
  const [cards, setCards] = useState<Card[]>([]);
  const [balances, setBalances] = useState<Record<string, CardBalance>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [cardList, cardBalances] = await Promise.all([
        loadCards(supabase, householdId),
        loadCardBalances(supabase, householdId),
      ]);
      setCards(cardList);
      setBalances(cardBalances);
      setLoading(false);
    })();
  }, [householdId]);

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

        <Text className="mb-1 font-display text-[22px] text-text">Cards</Text>
        <Text className="mb-5 text-[11px] text-muted2">
          Credit cards. Spend on a card is owed until you log a bill payment, so it does not lower your balance until
          then. Use Already owed for any balance a card had before you started tracking it here.
        </Text>

        <CardEditor householdId={householdId} items={cards} balances={balances} onChange={setCards} />
      </View>
    </Screen>
  );
}
