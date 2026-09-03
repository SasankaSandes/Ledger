import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { potFromRow, type Pot } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";

const RENAME_DEBOUNCE_MS = 500;

// Pots are budgets — a name and a spend limit, structurally independent of
// categories. Which categories' transactions count against a pot is chosen
// per transaction (Quick Add's optional pot picker), not configured here.
export function PotEditor({
  householdId,
  items,
  onChange,
}: {
  householdId: string;
  items: Pot[];
  onChange: (next: Pot[]) => void;
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
      .from("pots")
      .insert({ household_id: householdId, name, spend_limit: 0 })
      .select("id, household_id, name, spend_limit, archived_at")
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't add pot.");
      return;
    }
    onChange([...items, potFromRow(data)]);
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
      const { error: updateError } = await supabase.from("pots").update({ name }).eq("id", id);
      if (updateError) setError(updateError.message);
    }, RENAME_DEBOUNCE_MS);
  };

  const setSpendLimit = async (id: string, spendLimit: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, spendLimit } : it)));
    const { error: updateError } = await supabase
      .from("pots")
      .update({ spend_limit: spendLimit })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const archive = async (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    const { error: updateError } = await supabase
      .from("pots")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const confirmArchive = (item: Pot) => {
    confirmAction(`Remove "${item.name}"?`, "Past transactions keep it, but it'll disappear from pickers.", "Remove", () =>
      archive(item.id)
    );
  };

  return (
    <View className="gap-2">
      {error && <Text className="text-[11.5px] text-negative">{error}</Text>}
      {items.map((it) => (
        <View key={it.id} className="flex-row items-center gap-2 rounded-xl border border-line/10 bg-card px-3.5 py-3">
          <TextInput
            value={it.name}
            onChangeText={(name) => rename(it.id, name)}
            className="flex-1 font-body-medium text-[13.5px] text-text"
          />
          <AmountInput
            value={it.spendLimit}
            onChange={(n) => setSpendLimit(it.id, n ?? 0)}
            className="w-[92px] rounded-lg border border-line/10 bg-input px-2.5 py-[7px] text-right font-mono text-[12.5px] text-text"
          />
          <Pressable onPress={() => confirmArchive(it)} hitSlop={8}>
            <Text className="px-0.5 text-[15px] text-faint">×</Text>
          </Pressable>
        </View>
      ))}
      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New pot"
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
