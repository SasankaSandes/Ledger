import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Category } from "@/lib/types";

// Same chip styling as before (PotChipRow) — selected = gold border/tint,
// unselected = neutral hairline — plus a trailing "+ New" chip that expands
// into an inline text input. This is the "define as many as you want, on
// the fly" affordance: onCreate is responsible for the actual insert and
// leaves selecting the new category to the caller.
export function CategoryChipRow({
  categories,
  selectedId,
  onSelect,
  onCreate,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (trimmed) onCreate(trimmed);
  };

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {categories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onSelect(c.id)}
          className={`rounded-full border px-2.5 py-1 ${
            selectedId === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
          }`}
        >
          <Text className={`text-[11px] ${selectedId === c.id ? "text-gold" : "text-muted"}`}>{c.name}</Text>
        </Pressable>
      ))}
      {adding ? (
        <View className="flex-row items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] py-0.5 pl-2.5 pr-1">
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="name"
            placeholderTextColor="#5C6070"
            onSubmitEditing={submit}
            className="w-24 py-1 text-[11px] text-text"
          />
          <Pressable onPress={submit} hitSlop={6} className="px-1">
            <Text className="text-[13px] text-gold">✓</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} className="rounded-full border border-line/15 px-2.5 py-1">
          <Text className="text-[11px] text-muted">+ New</Text>
        </Pressable>
      )}
    </View>
  );
}
