import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Keypad } from "@/components/quickadd/Keypad";
import { CategoryChipRow } from "@/components/quickadd/CategoryChipRow";
import { PotChipRow } from "@/components/quickadd/PotChipRow";
import { DateField } from "@/components/ui/DateField";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import {
  TRANSACTION_COLUMNS,
  categoryFromRow,
  fmt,
  potFromRow,
  todayKey,
  transactionFromRow,
  type Category,
  type Pot,
} from "@/lib/types";

const CATEGORY_COLUMNS = "id, household_id, name, type, archived_at";
const POT_COLUMNS = "id, household_id, name, spend_limit, archived_at";

// Presented as a modal (see src/app/_layout.tsx), opened from a tapped row in
// Activity with ?id=<txnId>. Edits value, category, pot, date and description —
// type (Cash In/Out) is fixed, and period_id never changes, so a back-dated
// edit only moves the date label/sort, not which month the transaction counts
// in. Every save is one plain update; no merchant-map learning (that's a
// fresh-entry affordance, not a correction one).
export default function EditTransactionScreen() {
  const { householdId } = useHousehold();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);

  const [type, setType] = useState<"in" | "out">("out");
  const [digits, setDigits] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayKey());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId || !id) return;
    (async () => {
      const [{ data: txnRow }, { data: catData }, { data: potData }] = await Promise.all([
        supabase.from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).single(),
        supabase
          .from("categories")
          .select(CATEGORY_COLUMNS)
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("pots")
          .select(POT_COLUMNS)
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
      ]);

      if (!txnRow) {
        setError("Transaction not found.");
        setLoading(false);
        return;
      }
      const txn = transactionFromRow(txnRow);
      let cats = (catData ?? []).map(categoryFromRow);
      let potList = (potData ?? []).map(potFromRow);

      // The transaction's current category/pot may have been archived since —
      // pull that one row back in so it stays visible and swappable.
      if (!cats.some((c) => c.id === txn.categoryId)) {
        const { data } = await supabase.from("categories").select(CATEGORY_COLUMNS).eq("id", txn.categoryId).single();
        if (data) cats = [...cats, categoryFromRow(data)];
      }
      if (txn.potId && !potList.some((p) => p.id === txn.potId)) {
        const { data } = await supabase.from("pots").select(POT_COLUMNS).eq("id", txn.potId).single();
        if (data) potList = [...potList, potFromRow(data)];
      }

      setCategories(cats);
      setPots(potList);
      setType(txn.type);
      setDigits(String(txn.amount));
      setDesc(txn.desc);
      setDate(txn.date);
      setSelectedCategoryId(txn.categoryId);
      setSelectedPotId(txn.potId);
      setLoading(false);
    })();
  }, [householdId, id]);

  const categoriesForType = categories.filter((c) => c.type === type);
  const selectedCategory = categoriesForType.find((c) => c.id === selectedCategoryId) ?? null;
  const amount = Number(digits || "0");
  const canSave = amount > 0 && !!selectedCategory;

  const createCategory = async (name: string) => {
    if (!householdId) return;
    const { data } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name, type })
      .select(CATEGORY_COLUMNS)
      .single();
    if (!data) return;
    const created = categoryFromRow(data);
    setCategories((cur) => [...cur, created]);
    setSelectedCategoryId(created.id);
  };

  const createPot = async (name: string) => {
    if (!householdId) return;
    const { data } = await supabase
      .from("pots")
      .insert({ household_id: householdId, name, spend_limit: 0 })
      .select(POT_COLUMNS)
      .single();
    if (!data) return;
    const created = potFromRow(data);
    setPots((cur) => [...cur, created]);
    setSelectedPotId(created.id);
  };

  const save = async () => {
    if (!id || !selectedCategory || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          amount,
          category_id: selectedCategory.id,
          pot_id: type === "out" ? selectedPotId : null,
          description: desc.trim() || selectedCategory.name,
          date,
        })
        .eq("id", id);
      if (updateError) throw updateError;
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
      setSaving(false);
    }
  };

  const remove = () => {
    if (!id) return;
    confirmAction("Delete this transaction?", "This can't be undone.", "Delete", async () => {
      await supabase.from("transactions").delete().eq("id", id);
      router.back();
    });
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
          <View className="flex-row items-baseline gap-2">
            <Text className="font-display text-[20px] text-text">Edit</Text>
            <Text className="text-[11px] uppercase tracking-wider text-muted">
              {type === "out" ? "Cash Out" : "Cash In"}
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-[20px] leading-none text-muted2">×</Text>
          </Pressable>
        </View>

        {error && <Text className="mt-2 text-[12px] text-negative">{error}</Text>}

        <View className="mt-6 items-center">
          <Text className="font-mono text-[38px] text-text">{fmt(amount)}</Text>
        </View>

        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder={type === "out" ? "lunch, keells groceries, uber…" : "salary, freelance, gift…"}
          placeholderTextColor="#5C6070"
          className="mt-3 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[13px] text-text"
        />

        <View className="mt-3">
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
        </View>

        <View className="mt-3.5">
          <CategoryChipRow
            categories={categoriesForType}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onCreate={createCategory}
          />
        </View>

        {type === "out" && (
          <View className="mt-3">
            <Text className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted">Pot (optional)</Text>
            <PotChipRow pots={pots} selectedId={selectedPotId} onSelect={setSelectedPotId} onCreate={createPot} />
          </View>
        )}

        <View className="flex-1" />

        <Keypad
          onDigit={(d) => setDigits((cur) => (cur.length >= 9 ? cur : cur + d))}
          onBackspace={() => setDigits((cur) => cur.slice(0, -1))}
        />

        <Pressable
          onPress={save}
          disabled={!canSave || saving}
          className={`mt-3 items-center rounded-[11px] py-3.5 ${canSave ? "bg-gold" : "bg-fill"}`}
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          <Text className={`font-body-semibold text-[13.5px] ${canSave ? "text-on-gold" : "text-muted2"}`}>
            {saving ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>

        <Pressable onPress={remove} hitSlop={8} className="mt-2.5 items-center py-1">
          <Text className="text-[12px] text-negative">Delete transaction</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
