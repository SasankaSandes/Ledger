import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { CARD_COLUMNS, cardFromRow, cardOwed, fmt, type Card, type CardBalance } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";

const RENAME_DEBOUNCE_MS = 500;

const AMOUNT_INPUT_CLASS =
  "w-[104px] rounded-lg border border-line/10 bg-input px-2.5 py-[7px] text-right font-mono text-[12.5px] text-text";

// Credit cards: a name, a monthly spend limit (0 = no limit, same as pots),
// and an "already owed" starting balance for debt that predates tracking it
// here. What's owed *now* is that plus every charge minus every payment —
// shown read-only so it's clear why archiving a card with a balance matters.
export function CardEditor({
  householdId,
  items,
  balances,
  onChange,
}: {
  householdId: string;
  items: Card[];
  balances: Record<string, CardBalance>;
  onChange: (next: Card[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("cards")
      .insert({ household_id: householdId, name })
      .select(CARD_COLUMNS)
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't add card.");
      return;
    }
    onChange([...items, cardFromRow(data)]);
    setNewName("");
  };

  // NOTE: every mutation below must `await` its Supabase call (or the
  // postgrest-js builder's fetch never actually fires — it's a thenable
  // that only dispatches the request from inside .then()/await, so a
  // fire-and-forget call silently does nothing).
  // `updated_at` / `updated_by` are maintained by a DB trigger — don't send them.
  const rename = (id: string, name: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, name } : it)));
    if (renameTimers.current[id]) clearTimeout(renameTimers.current[id]);
    renameTimers.current[id] = setTimeout(async () => {
      const { error: updateError } = await supabase.from("cards").update({ name }).eq("id", id);
      if (updateError) setError(updateError.message);
    }, RENAME_DEBOUNCE_MS);
  };

  const setSpendLimit = async (id: string, spendLimit: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, spendLimit } : it)));
    const { error: updateError } = await supabase.from("cards").update({ spend_limit: spendLimit }).eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const setOpeningOwed = async (id: string, openingOwed: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, openingOwed } : it)));
    const { error: updateError } = await supabase.from("cards").update({ opening_owed: openingOwed }).eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const archive = async (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    const { error: updateError } = await supabase
      .from("cards")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  // An archived card drops off Home, so a balance still owed on it would
  // vanish from view — say so before they confirm.
  const confirmArchive = (item: Card) => {
    const owed = cardOwed(item, balances[item.id]);
    const message =
      owed > 0
        ? `You still owe ${fmt(owed)} on it. Past transactions keep it, but it'll disappear from pickers and Home.`
        : "Past transactions keep it, but it'll disappear from pickers.";
    confirmAction(`Remove "${item.name}"?`, message, "Remove", () => archive(item.id));
  };

  return (
    <View className="gap-2">
      {error && <Text className="text-[11.5px] text-negative">{error}</Text>}
      {items.map((it) => (
        <View key={it.id} className="rounded-xl border border-line/10 bg-card px-3.5 py-3">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={it.name}
              onChangeText={(name) => rename(it.id, name)}
              className="flex-1 font-body-medium text-[13.5px] text-text"
            />
            <Pressable onPress={() => confirmArchive(it)} hitSlop={8}>
              <Text className="px-0.5 text-[15px] text-faint">×</Text>
            </Pressable>
          </View>

          <View className="mt-2.5 flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[11px] text-muted2">Monthly limit</Text>
            <AmountInput
              value={it.spendLimit}
              onChange={(n) => setSpendLimit(it.id, n ?? 0)}
              placeholder="no limit"
              className={AMOUNT_INPUT_CLASS}
            />
          </View>
          <View className="mt-2 flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[11px] text-muted2">Already owed</Text>
            <AmountInput
              value={it.openingOwed}
              onChange={(n) => setOpeningOwed(it.id, n ?? 0)}
              className={AMOUNT_INPUT_CLASS}
            />
          </View>
          <View className="mt-2 flex-row items-center justify-between border-t border-line/5 pt-2">
            <Text className="text-[11px] text-muted2">Owed now</Text>
            <Text className="font-mono text-[12.5px] text-text">{fmt(cardOwed(it, balances[it.id]))}</Text>
          </View>
        </View>
      ))}
      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New card"
          placeholderTextColor="#5C6070"
          onSubmitEditing={add}
          className="flex-1 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[12.5px] text-text"
        />
        <Pressable onPress={add} className="w-11 items-center justify-center rounded-lg bg-fill">
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
