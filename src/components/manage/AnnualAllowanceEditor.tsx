import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { uid, type AnnualAllowanceDef } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";

// Same by-id CRUD pattern as PotEditor, minus the cashable toggle — annual
// allowances always support cash-out, gated only by an optional cap.
export function AnnualAllowanceEditor({
  items,
  onChange,
}: {
  items: AnnualAllowanceDef[];
  onChange: (next: AnnualAllowanceDef[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const patch = (id: string, p: Partial<AnnualAllowanceDef>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const add = () => {
    if (!newName.trim()) return;
    onChange([...items, { id: uid(), name: newName.trim(), amount: 0, cashoutCap: null }]);
    setNewName("");
  };

  return (
    <View className="gap-2">
      {items.map((it) => (
        <View key={it.id} className="rounded-xl border border-line/10 bg-card px-3.5 py-3">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={it.name}
              onChangeText={(name) => patch(it.id, { name })}
              className="flex-1 font-body-medium text-[13.5px] text-text"
            />
            <AmountInput
              value={it.amount}
              onChange={(n) => patch(it.id, { amount: n ?? 0 })}
              placeholder="0 / yr"
              className="w-[92px] rounded-lg border border-line/10 bg-input px-2.5 py-[7px] text-right font-mono text-[12.5px] text-text"
            />
            <Pressable onPress={() => remove(it.id)} hitSlop={8}>
              <Text className="px-0.5 text-[15px] text-faint">×</Text>
            </Pressable>
          </View>
          <View className="mt-2 flex-row items-center gap-2">
            <Text className="text-[11px] text-muted">Cash-out cap</Text>
            <AmountInput
              value={it.cashoutCap}
              nullable
              placeholder="none"
              onChange={(n) => patch(it.id, { cashoutCap: n })}
            />
          </View>
        </View>
      ))}
      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New annual allowance"
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
