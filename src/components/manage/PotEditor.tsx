import { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { uid, type PotDef } from "@/lib/types";
import { AmountInput } from "@/components/ui/AmountInput";
import { darkTokens } from "@/lib/theme/tokens";

// Same by-id CRUD pattern as FixedExpenseEditor, extended with the
// cashable toggle + cashout cap that make a pot behave like the old
// "monthly allowance" instead of a plain "budget category."
export function PotEditor({
  items,
  onChange,
}: {
  items: PotDef[];
  onChange: (next: PotDef[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const patch = (id: string, p: Partial<PotDef>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const add = () => {
    if (!newName.trim()) return;
    onChange([...items, { id: uid(), name: newName.trim(), cap: 0, cashable: false, cashoutCap: null }]);
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
              value={it.cap}
              onChange={(n) => patch(it.id, { cap: n ?? 0 })}
              placeholder="no cap"
              className="w-[92px] rounded-lg border border-line/10 bg-input px-2.5 py-[7px] text-right font-mono text-[12.5px] text-text"
            />
            <Pressable onPress={() => remove(it.id)} hitSlop={8}>
              <Text className="px-0.5 text-[15px] text-faint">×</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => patch(it.id, { cashable: !it.cashable, cashoutCap: it.cashable ? null : it.cashoutCap })}
            className="mt-2.5 flex-row items-center gap-2"
          >
            <Switch
              value={it.cashable}
              onValueChange={(v) => patch(it.id, { cashable: v, cashoutCap: v ? it.cashoutCap : null })}
              trackColor={{ false: darkTokens.fill2, true: darkTokens.positive }}
              thumbColor={darkTokens.text}
            />
            <Text className="flex-1 text-[11.5px] text-muted">Cashable — leftover can be claimed as cash</Text>
          </Pressable>
          {it.cashable && (
            <View className="mt-2 flex-row items-center gap-2">
              <Text className="text-[11px] text-muted">Cash-out cap</Text>
              <AmountInput
                value={it.cashoutCap}
                nullable
                placeholder="none"
                onChange={(n) => patch(it.id, { cashoutCap: n })}
              />
            </View>
          )}
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
