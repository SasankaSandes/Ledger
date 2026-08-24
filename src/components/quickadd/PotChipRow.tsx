import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Pot } from "@/lib/types";

// Optional, separate from category selection — leaving it on "No pot"
// means this spend isn't tracked against any budget. Same "+ New" inline
// creation pattern as CategoryChipRow.
export function PotChipRow({
  pots,
  selectedId,
  onSelect,
  onCreate,
}: {
  pots: Pot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
      <Pressable
        onPress={() => onSelect(null)}
        className={`rounded-full border px-2.5 py-1 ${
          selectedId === null ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
        }`}
      >
        <Text className={`text-[11px] ${selectedId === null ? "text-gold" : "text-muted"}`}>No pot</Text>
      </Pressable>
      {pots.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onSelect(p.id)}
          className={`rounded-full border px-2.5 py-1 ${
            selectedId === p.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
          }`}
        >
          <Text className={`text-[11px] ${selectedId === p.id ? "text-gold" : "text-muted"}`}>{p.name}</Text>
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
          <Text className="text-[11px] text-muted">+ New pot</Text>
        </Pressable>
      )}
    </View>
  );
}
