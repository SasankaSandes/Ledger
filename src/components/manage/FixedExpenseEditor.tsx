import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { fixedExpenseDefFromRow, type Category, type FixedExpenseDef } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";

const RENAME_DEBOUNCE_MS = 500;

// Fixed expenses are their own list, each linked to a Cash Out category for
// its transaction tag — never to a Pot (a fixed expense is already
// accounted for, so its confirms shouldn't also eat into a budget's
// limit). `outCategories` is the household's Cash Out categories to pick
// from; a new fixed expense defaults to the first one.
export function FixedExpenseEditor({
  householdId,
  outCategories,
  items,
  onChange,
}: {
  householdId: string;
  outCategories: Category[];
  items: FixedExpenseDef[];
  onChange: (next: FixedExpenseDef[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const add = async () => {
    const name = newName.trim();
    if (!name || adding || outCategories.length === 0) return;
    setAdding(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("fixed_expenses")
      .insert({ household_id: householdId, category_id: outCategories[0].id, name, amount: 0, active: true })
      .select("id, household_id, category_id, name, amount, active")
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't add fixed expense.");
      return;
    }
    onChange([...items, fixedExpenseDefFromRow(data)]);
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
      const { error: updateError } = await supabase.from("fixed_expenses").update({ name }).eq("id", id);
      if (updateError) setError(updateError.message);
    }, RENAME_DEBOUNCE_MS);
  };

  const setAmount = async (id: string, amount: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, amount } : it)));
    const { error: updateError } = await supabase.from("fixed_expenses").update({ amount }).eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const setCategory = async (id: string, categoryId: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, categoryId } : it)));
    const { error: updateError } = await supabase
      .from("fixed_expenses")
      .update({ category_id: categoryId })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  // Retire, don't hard-delete — history (past confirmed transactions) stays
  // intact, and it just stops surfacing as pending each new month.
  const remove = async (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    const { error: updateError } = await supabase
      .from("fixed_expenses")
      .update({ active: false })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const confirmRemove = (item: FixedExpenseDef) => {
    confirmAction(`Remove "${item.name}"?`, "It'll stop appearing each month, but past transactions stay.", "Remove", () =>
      remove(item.id)
    );
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
              className="flex-1 text-[13px] text-text2"
            />
            <AmountInput
              value={it.amount}
              onChange={(n) => setAmount(it.id, n ?? 0)}
              className="w-[92px] rounded-lg border border-line/10 bg-input px-2.5 py-[7px] text-right font-mono text-[12.5px] text-text"
            />
            <Pressable onPress={() => confirmRemove(it)} hitSlop={8}>
              <Text className="px-0.5 text-[15px] text-faint">×</Text>
            </Pressable>
          </View>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {outCategories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(it.id, c.id)}
                className={`rounded-full border px-2.5 py-1 ${
                  it.categoryId === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                }`}
              >
                <Text className={`text-[11px] ${it.categoryId === c.id ? "text-gold" : "text-muted"}`}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Rent"
          placeholderTextColor="#5C6070"
          onSubmitEditing={add}
          className="flex-1 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[12.5px] text-text"
        />
        <Pressable
          onPress={add}
          disabled={outCategories.length === 0}
          className="w-11 items-center justify-center rounded-lg bg-fill"
          style={{ opacity: outCategories.length === 0 ? 0.5 : 1 }}
        >
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>
      {outCategories.length === 0 && (
        <Text className="text-[11.5px] text-muted2">Add a Cash Out category first to link fixed expenses to.</Text>
      )}
    </View>
  );
}
