import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Category } from "@/lib/types";

// Quick Add's category picker: one horizontally scrolling row of 36pt chips
// instead of a wrapping block, so the row costs the same height whether the
// household has 4 categories or 40. The selected chip is scrolled into view
// (a category suggested from the note may sit off-screen), and it wears a ✦
// while it's a suggestion rather than something the user tapped. Trailing
// "+ New" is the same inline create as before: onCreate does the insert and
// selects what it made.
export function QuickCategoryRow({
  categories,
  selectedId,
  suggested,
  onSelect,
  onCreate,
}: {
  categories: Category[];
  selectedId: string | null;
  suggested: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!selectedId) return;
    const x = chipX.current[selectedId];
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [selectedId]);

  const submit = () => {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (trimmed) onCreate(trimmed);
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 6, paddingRight: 8 }}
    >
      {categories.map((c) => {
        const selected = selectedId === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            onLayout={(e) => {
              const { x } = e.nativeEvent.layout;
              const firstLayout = chipX.current[c.id] === undefined;
              chipX.current[c.id] = x;
              // A chip that is already selected when it first lays out (Edit opens
              // on the saved category; a just-created one) missed the effect
              // above, which runs before its position is known.
              if (firstLayout && selected) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: false });
            }}
            className={`h-9 flex-row items-center justify-center rounded-full border px-3.5 ${
              selected ? "border-gold/50 bg-gold/[0.12]" : "border-line/15"
            }`}
          >
            <Text className={`text-[13px] ${selected ? "text-gold" : "text-text2"}`}>
              {selected && suggested ? "✦ " : ""}
              {c.name}
            </Text>
          </Pressable>
        );
      })}
      {adding ? (
        <View className="h-9 flex-row items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] pl-3.5 pr-1">
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="name"
            placeholderTextColor="#5C6070"
            onSubmitEditing={submit}
            className="w-24 py-1 text-[13px] text-text"
          />
          <Pressable onPress={submit} hitSlop={6} className="px-1">
            <Text className="text-[15px] text-gold">✓</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          className="h-9 items-center justify-center rounded-full border border-line/15 px-3.5"
        >
          <Text className="text-[13px] text-muted">+ New</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
