import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Keypad } from "@/components/quickadd/Keypad";
import { CategoryChipRow } from "@/components/quickadd/CategoryChipRow";
import { PotChipRow } from "@/components/quickadd/PotChipRow";
import { PayModeField, type PayMode } from "@/components/quickadd/PayModeField";
import { DateField } from "@/components/ui/DateField";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import { loadCards } from "@/lib/cards";
import { inferCategory, learnMapping, loadMerchantMap } from "@/lib/merchantRouting";
import {
  CARD_COLUMNS,
  cardFromRow,
  categoryFromRow,
  fmt,
  potFromRow,
  todayKey,
  type Card,
  type Category,
  type MerchantMapEntry,
  type Period,
  type Pot,
} from "@/lib/types";

type Mode = "out" | "in";

// Presented as a modal (see src/app/_layout.tsx) from the center tab-bar
// "+" button. Owns its own period/category/pot/card/merchant-map load — a
// separate route from Home, not sharing its in-memory state. Every confirm
// is one plain insert into `transactions`; category is always required,
// pot is an optional, independent choice only offered for Cash Out, and so
// is "paid with" — Cash Out on Credit is charged to a card (owed, not yet
// cash out) and requires picking one. Card bill payments live on Home.
export default function QuickAddScreen() {
  const { householdId } = useHousehold();
  const [period, setPeriod] = useState<Period | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [merchantMap, setMerchantMap] = useState<MerchantMapEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("out");
  const [digits, setDigits] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayKey());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [openPeriod, { data: catData }, { data: potData }, cardList, merchants] = await Promise.all([
        ensureOpenPeriod(supabase, householdId),
        supabase
          .from("categories")
          .select("id, household_id, name, type, archived_at")
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("pots")
          .select("id, household_id, name, spend_limit, archived_at")
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        loadCards(supabase, householdId),
        loadMerchantMap(supabase, householdId),
      ]);
      setPeriod(openPeriod);
      setCategories((catData ?? []).map(categoryFromRow));
      setPots((potData ?? []).map(potFromRow));
      setCards(cardList);
      setMerchantMap(merchants);
      setLoading(false);
    })();
  }, [householdId]);

  const categoriesForMode = categories.filter((c) => c.type === mode);
  const selectedCategory = categoriesForMode.find((c) => c.id === selectedCategoryId) ?? null;

  const onChangeDesc = useCallback(
    (text: string) => {
      setDesc(text);
      if (!categoryManuallySet) {
        const guess = inferCategory(text, categories, merchantMap, mode);
        setSelectedCategoryId(guess?.id ?? null);
      }
    },
    [categoryManuallySet, categories, merchantMap, mode]
  );

  const selectCategory = (id: string) => {
    setSelectedCategoryId(id);
    setCategoryManuallySet(true);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setCategoryManuallySet(false);
    setSelectedPotId(null);
    setPayMode("cash");
    setSelectedCardId(null);
    const guess = inferCategory(desc, categories, merchantMap, m);
    setSelectedCategoryId(guess?.id ?? null);
  };

  const createCategory = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name, type: mode })
      .select("id, household_id, name, type, archived_at")
      .single();
    if (insertError || !data) return;
    const created = categoryFromRow(data);
    setCategories((cur) => [...cur, created]);
    setSelectedCategoryId(created.id);
    setCategoryManuallySet(true);
  };

  const createPot = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("pots")
      .insert({ household_id: householdId, name, spend_limit: 0 })
      .select("id, household_id, name, spend_limit, archived_at")
      .single();
    if (insertError || !data) return;
    const created = potFromRow(data);
    setPots((cur) => [...cur, created]);
    setSelectedPotId(created.id);
  };

  const createCard = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("cards")
      .insert({ household_id: householdId, name })
      .select(CARD_COLUMNS)
      .single();
    if (insertError || !data) return;
    const created = cardFromRow(data);
    setCards((cur) => [...cur, created]);
    setSelectedCardId(created.id);
  };

  const resetForm = () => {
    setDigits("");
    setDesc("");
    setDate(todayKey());
    setSelectedCategoryId(null);
    setCategoryManuallySet(false);
    setSelectedPotId(null);
    setPayMode("cash");
    setSelectedCardId(null);
  };

  const amount = Number(digits || "0");
  const chargedCard = mode === "out" && payMode === "credit" ? (cards.find((c) => c.id === selectedCardId) ?? null) : null;
  const needsCard = mode === "out" && payMode === "credit" && !chargedCard;
  const canConfirm = amount > 0 && !!selectedCategory && !needsCard;

  const confirm = async () => {
    if (!householdId || !period || !selectedCategory || !canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("transactions").insert({
        household_id: householdId,
        period_id: period.id,
        category_id: selectedCategory.id,
        pot_id: mode === "out" ? selectedPotId : null,
        card_id: chargedCard?.id ?? null,
        type: mode,
        amount,
        description: desc.trim() || selectedCategory.name,
        date,
      });
      if (insertError) throw insertError;
      setJustAdded(`Added to ${selectedCategory.name}${chargedCard ? ` · ${chargedCard.name}` : ""}`);

      if (desc.trim()) {
        await learnMapping(supabase, householdId, desc, selectedCategory.id, mode);
        setMerchantMap(await loadMerchantMap(supabase, householdId));
      }

      resetForm();
      setTimeout(() => setJustAdded(null), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !period) {
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
          <View className="flex-row gap-1 rounded-[11px] border border-line/10 bg-card p-1">
            {(["out", "in"] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                className={`items-center rounded-lg px-3.5 py-1.5 ${mode === m ? "bg-fill" : ""}`}
              >
                <Text className={`text-[12.5px] font-body-medium ${mode === m ? "text-text" : "text-muted"}`}>
                  {m === "out" ? "Cash Out" : "Cash In"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-[20px] leading-none text-muted2">×</Text>
          </Pressable>
        </View>

        {error && <Text className="mt-2 text-[12px] text-negative">{error}</Text>}

        <View className="mt-6 items-center">
          <Text className="font-mono text-[38px] text-text">{fmt(amount)}</Text>
          <Text className="mt-1 h-4 text-[12px] text-positive">{justAdded ?? ""}</Text>
        </View>

        <TextInput
          value={desc}
          onChangeText={onChangeDesc}
          placeholder={mode === "out" ? "lunch, keells groceries, uber…" : "salary, freelance, gift…"}
          placeholderTextColor="#5C6070"
          className="mt-3 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[13px] text-text"
        />

        <View className="mt-3">
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
        </View>

        <View className="mt-3.5">
          <CategoryChipRow
            categories={categoriesForMode}
            selectedId={selectedCategoryId}
            onSelect={selectCategory}
            onCreate={createCategory}
          />
        </View>

        {mode === "out" && (
          <View className="mt-3">
            <Text className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted">Pot (optional)</Text>
            <PotChipRow pots={pots} selectedId={selectedPotId} onSelect={setSelectedPotId} onCreate={createPot} />
          </View>
        )}

        {mode === "out" && (
          <View className="mt-3">
            <PayModeField
              payMode={payMode}
              onPayModeChange={setPayMode}
              cards={cards}
              selectedCardId={selectedCardId}
              onSelectCard={setSelectedCardId}
              onCreateCard={createCard}
            />
          </View>
        )}

        <View className="flex-1" />

        <Keypad
          onDigit={(d) => setDigits((cur) => (cur.length >= 9 ? cur : cur + d))}
          onBackspace={() => setDigits((cur) => cur.slice(0, -1))}
        />

        <Pressable
          onPress={confirm}
          disabled={!canConfirm || saving}
          className={`mt-3 items-center rounded-[11px] py-3.5 ${canConfirm ? "bg-gold" : "bg-fill"}`}
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          <Text className={`font-body-semibold text-[13.5px] ${canConfirm ? "text-on-gold" : "text-muted2"}`}>
            {saving ? "Adding…" : "Add"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
