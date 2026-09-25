import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Card } from "@/lib/types";

export type PayMode = "cash" | "credit";

// "Paid with" for a Cash Out: a Cash / Credit toggle, and — only when Credit —
// a chip row of the household's cards with the same inline "+ New card"
// creation as pots/categories. Controlled: the parent owns both payMode and
// selectedCardId and must require a card before saving a Credit entry.
export function PayModeField({
  payMode,
  onPayModeChange,
  cards,
  selectedCardId,
  onSelectCard,
  onCreateCard,
}: {
  payMode: PayMode;
  onPayModeChange: (mode: PayMode) => void;
  cards: Card[];
  selectedCardId: string | null;
  onSelectCard: (id: string | null) => void;
  onCreateCard: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const choose = (mode: PayMode) => {
    onPayModeChange(mode);
    if (mode === "cash") {
      onSelectCard(null);
    } else if (!selectedCardId && cards.length === 1) {
      // Only one card to choose from — no reason to make them tap it.
      onSelectCard(cards[0].id);
    }
  };

  const submit = () => {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (trimmed) onCreateCard(trimmed);
  };

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[10.5px] uppercase tracking-wider text-muted">Paid with</Text>
        <View className="flex-row gap-1 rounded-[9px] border border-line/10 bg-card p-0.5">
          {(["cash", "credit"] as PayMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => choose(m)}
              className={`items-center rounded-md px-3 py-1 ${payMode === m ? "bg-fill" : ""}`}
            >
              <Text className={`text-[11.5px] font-body-medium ${payMode === m ? "text-text" : "text-muted"}`}>
                {m === "cash" ? "Cash" : "Credit"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {payMode === "credit" && (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {cards.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => onSelectCard(c.id)}
              className={`rounded-full border px-2.5 py-1 ${
                selectedCardId === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
              }`}
            >
              <Text className={`text-[11px] ${selectedCardId === c.id ? "text-gold" : "text-muted"}`}>{c.name}</Text>
            </Pressable>
          ))}
          {adding ? (
            <View className="flex-row items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] py-0.5 pl-2.5 pr-1">
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                placeholder="card name"
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
              <Text className="text-[11px] text-muted">+ New card</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
