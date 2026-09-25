import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Keypad } from "@/components/quickadd/Keypad";
import { DateField } from "@/components/ui/DateField";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import { loadCardBalances, loadCards, payCardBill } from "@/lib/cards";
import { cardOwed, fmt, todayKey, type Card, type CardBalance, type Period } from "@/lib/types";

// Presented as a modal (see src/app/_layout.tsx), opened from the "Pay"
// button on a card row on Home with ?card=<cardId>. Records a card bill
// payment into the open period: cash leaves (the month balance drops) and the
// card's owed amount goes down. The card can still be switched here in case
// they tapped the wrong row.
export default function PayCardScreen() {
  const { householdId } = useHousehold();
  const { card: cardParam } = useLocalSearchParams<{ card?: string }>();

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [balances, setBalances] = useState<Record<string, CardBalance>>({});
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [date, setDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      try {
        const [openPeriod, cardList, cardBalances] = await Promise.all([
          ensureOpenPeriod(supabase, householdId),
          loadCards(supabase, householdId),
          loadCardBalances(supabase, householdId),
        ]);
        setPeriod(openPeriod);
        setCards(cardList);
        setBalances(cardBalances);
        const requested = typeof cardParam === "string" ? cardParam : null;
        setSelectedCardId(
          cardList.find((c) => c.id === requested)?.id ?? (cardList.length === 1 ? cardList[0].id : null)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your cards.");
      }
      setLoading(false);
    })();
  }, [householdId, cardParam]);

  const card = cards.find((c) => c.id === selectedCardId) ?? null;
  const owed = card ? cardOwed(card, balances[card.id]) : 0;
  const amount = Number(digits || "0");
  const canPay = amount > 0 && !!card && !!period;

  const pay = async () => {
    if (!householdId || !period || !card || !canPay) return;
    setSaving(true);
    setError(null);
    try {
      await payCardBill(supabase, { householdId, period, card, amount, date });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={["top", "bottom"]}>
      <View className="flex-1 px-4 pb-4 pt-3">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-[20px] text-text">Pay card bill</Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-[20px] leading-none text-muted2">×</Text>
          </Pressable>
        </View>

        {error && <Text className="mt-2 text-[12px] text-negative">{error}</Text>}

        {cards.length === 0 ? (
          <Text className="mt-6 text-[12.5px] text-muted2">
            No cards yet — add one from Settings → Cards, or when logging a Credit expense.
          </Text>
        ) : (
          <>
            {cards.length > 1 && (
              <View className="mt-3 flex-row flex-wrap gap-1.5">
                {cards.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedCardId(c.id)}
                    className={`rounded-full border px-2.5 py-1 ${
                      selectedCardId === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                    }`}
                  >
                    <Text className={`text-[11px] ${selectedCardId === c.id ? "text-gold" : "text-muted"}`}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View className="mt-6 items-center">
              <Text className="font-mono text-[38px] text-text">{fmt(amount)}</Text>
              <Text className="mt-1 h-4 text-[12px] text-muted2">
                {card ? `${card.name} · owed ${fmt(owed)}` : "Pick a card"}
              </Text>
            </View>

            {card && owed > 0 && (
              <Pressable
                onPress={() => setDigits(String(Math.round(owed)))}
                hitSlop={6}
                className="mt-2 items-center"
              >
                <Text className="text-[11.5px] text-gold underline">Pay full balance</Text>
              </Pressable>
            )}

            <View className="mt-4">
              <DateField value={date} onChange={setDate} maximumDate={new Date()} />
            </View>
          </>
        )}

        <View className="flex-1" />

        <Keypad
          onDigit={(d) => setDigits((cur) => (cur.length >= 9 ? cur : cur + d))}
          onBackspace={() => setDigits((cur) => cur.slice(0, -1))}
        />

        <Pressable
          onPress={pay}
          disabled={!canPay || saving}
          className={`mt-3 items-center rounded-[11px] py-3.5 ${canPay ? "bg-gold" : "bg-fill"}`}
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          <Text className={`font-body-semibold text-[13.5px] ${canPay ? "text-on-gold" : "text-muted2"}`}>
            {saving ? "Recording…" : "Record payment"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
