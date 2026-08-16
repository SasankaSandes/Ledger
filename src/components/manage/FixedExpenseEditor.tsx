import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { uid, type FixedExpenseDef } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";

// By-id CRUD list, fully controlled — shared between Onboarding and
// Manage. Reused as the direct template for PotEditor below.
export function FixedExpenseEditor({
  items,
  onChange,
}: {
  items: FixedExpenseDef[];
  onChange: (next: FixedExpenseDef[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const patch = (id: string, p: Partial<FixedExpenseDef>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const add = () => {
    if (!newName.trim()) return;
    onChange([...items, { id: uid(), name: newName.trim(), amount: 0 }]);
    setNewName("");
  };

  return (
    <View>
      {items.map((it) => (
        <View key={it.id} className="flex-row items-center gap-2 border-b border-line/5 py-2">
          <TextInput
            value={it.name}
            onChangeText={(name) => patch(it.id, { name })}
            className="flex-1 text-[13px] text-text2"
          />
          <AmountInput value={it.amount} onChange={(n) => patch(it.id, { amount: n ?? 0 })} />
          <Pressable onPress={() => remove(it.id)} hitSlop={8}>
            <Text className="px-0.5 text-[15px] text-faint">×</Text>
          </Pressable>
        </View>
      ))}
      <View className="flex-row gap-1.5 pt-2.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Rent"
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
