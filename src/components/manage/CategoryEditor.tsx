import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { categoryFromRow, type Category } from "@/lib/types";

const RENAME_DEBOUNCE_MS = 500;

// One combined list for both Cash In and Cash Out categories — pure
// organizing/filtering tags, no limit (budgeting lives on Pot, a separate
// entity edited elsewhere). Every edit here writes directly to Supabase,
// with the parent's `items`/`onChange` kept only for optimistic local
// state.
export function CategoryEditor({
  householdId,
  items,
  onChange,
}: {
  householdId: string;
  items: Category[];
  onChange: (next: Category[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"in" | "out">("out");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name, type: newType })
      .select("id, household_id, name, type, archived_at")
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't add category.");
      return;
    }
    onChange([...items, categoryFromRow(data)]);
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
      const { error: updateError } = await supabase.from("categories").update({ name }).eq("id", id);
      if (updateError) setError(updateError.message);
    }, RENAME_DEBOUNCE_MS);
  };

  const setType = async (id: string, type: "in" | "out") => {
    onChange(items.map((it) => (it.id === id ? { ...it, type } : it)));
    const { error: updateError } = await supabase.from("categories").update({ type }).eq("id", id);
    if (updateError) setError(updateError.message);
  };

  // Soft-delete: archived categories drop out of pickers everywhere but
  // stay visible (grayed out) in Activity history/filters for whatever
  // transactions already reference them.
  const archive = async (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    const { error: updateError } = await supabase
      .from("categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  };

  const confirmArchive = (item: Category) => {
    confirmAction(`Remove "${item.name}"?`, "It'll disappear from pickers, but past transactions keep it.", "Remove", () =>
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
          <View className="flex-row gap-1 rounded-lg bg-input p-0.5">
            {(["in", "out"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(it.id, t)}
                className={`rounded px-2 py-1 ${it.type === t ? "bg-fill" : ""}`}
              >
                <Text className={`text-[10px] ${it.type === t ? "text-text" : "text-muted2"}`}>
                  {t === "in" ? "In" : "Out"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => confirmArchive(it)} hitSlop={8}>
            <Text className="px-0.5 text-[15px] text-faint">×</Text>
          </Pressable>
        </View>
      ))}
      <View className="flex-row items-center gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New category"
          placeholderTextColor="#5C6070"
          onSubmitEditing={add}
          className="flex-1 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[12.5px] text-text"
        />
        <View className="flex-row gap-1 rounded-lg bg-input p-0.5">
          {(["in", "out"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setNewType(t)}
              className={`rounded px-2 py-1.5 ${newType === t ? "bg-fill" : ""}`}
            >
              <Text className={`text-[10.5px] ${newType === t ? "text-text" : "text-muted2"}`}>
                {t === "in" ? "In" : "Out"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={add} className="w-11 items-center justify-center rounded-lg bg-fill">
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
