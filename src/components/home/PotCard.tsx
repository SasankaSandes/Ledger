import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { cashoutRoom, fmt, potSpent, shortDate, sumItems, type PotRow } from "@/lib/types";

export function PotCard({
  pot,
  expanded,
  onToggle,
  onAddSpend,
  onRemoveSpend,
  onCashOut,
}: {
  pot: PotRow;
  expanded: boolean;
  onToggle: () => void;
  onAddSpend: (desc: string, amount: number) => void;
  onRemoveSpend: (itemId: string) => void;
  onCashOut: (amount: number) => void;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  const spent = potSpent(pot);
  const cap = Number(pot.cap || 0);
  const over = cap > 0 && spent > cap;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const room = cashoutRoom(pot);
  const cashedSoFar = sumItems(pot.cashoutItems);

  const submitAdd = () => {
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    if (!amt) return;
    onAddSpend(desc || pot.name, amt);
    setDesc("");
    setAmount("");
  };

  return (
    <View className="overflow-hidden rounded-[13px] border border-line/10 bg-card">
      <Pressable onPress={onToggle} className="px-3.5 py-3.5">
        <View className="flex-row items-baseline gap-2">
          <Text className="font-body-medium text-[13.5px] text-text">{pot.name}</Text>
          {pot.cashable && (
            <View className="rounded bg-positive/[0.12] px-[5px] py-[2px]">
              <Text className="font-mono text-[8.5px] tracking-wider text-positive">CASH</Text>
            </View>
          )}
          <View className="flex-1" />
          <Text className={`font-mono text-[12.5px] ${over ? "text-negative" : "text-text"}`}>{fmt(spent)}</Text>
          <Text className="font-mono text-[11px] text-muted2">{cap > 0 ? `/ ${cap.toLocaleString()}` : "/ no cap"}</Text>
        </View>
        <View className="mt-2.5 h-1 overflow-hidden rounded bg-fill">
          <View
            className={`h-1 rounded ${over ? "bg-negative" : "bg-gold"}`}
            style={{ width: `${cap > 0 ? (over ? 100 : pct) : 0}%` }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View className="px-3.5 pb-3.5">
          <View className="mb-2.5 h-px bg-line/10" />

          {pot.spendItems.length === 0 && (
            <Text className="pb-2 text-[12px] text-muted2">Nothing logged yet.</Text>
          )}
          {pot.spendItems.map((it) => (
            <View key={it.id} className="flex-row items-center gap-2.5 py-1.5">
              <Text className="flex-1 text-[12.5px] text-text2" numberOfLines={1}>
                {it.desc}
              </Text>
              <Text className="font-mono text-[10.5px] text-muted2">{shortDate(it.date)}</Text>
              <Text className="min-w-[64px] text-right font-mono text-[12.5px] text-text">
                {it.amount.toLocaleString()}
              </Text>
              <Pressable onPress={() => onRemoveSpend(it.id)} hitSlop={8}>
                <Text className="px-0.5 text-[14px] text-faint">×</Text>
              </Pressable>
            </View>
          ))}

          <View className="mt-2.5 flex-row gap-[7px]">
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="description"
              placeholderTextColor="#5C6070"
              className="flex-1 rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-[12.5px] text-text"
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              inputMode="numeric"
              placeholder="0"
              placeholderTextColor="#5C6070"
              onSubmitEditing={submitAdd}
              className="w-[78px] rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-right font-mono text-[12.5px] text-text"
            />
            <Pressable onPress={submitAdd} className="w-[38px] items-center justify-center rounded-lg bg-fill">
              <Text className="text-[16px] text-gold">+</Text>
            </Pressable>
          </View>

          {pot.cashable && (
            <View className="mt-3 rounded-[10px] border border-positive/25 bg-positive/[0.1] px-3 py-2.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-body-medium uppercase tracking-wider text-positive">
                  Cash in hand
                </Text>
                <Text className="font-mono text-[13px] text-positive">{fmt(cashedSoFar)}</Text>
              </View>
              {pot.cashoutItems.map((ci) => (
                <View key={ci.id} className="flex-row items-center gap-2.5 pt-1">
                  <Text className="flex-1 text-[12px] text-muted">{ci.desc}</Text>
                  <Text className="font-mono text-[12px] text-muted">{ci.amount.toLocaleString()}</Text>
                </View>
              ))}
              <Pressable
                onPress={() => room > 0 && onCashOut(room)}
                className="mt-2 items-center rounded-lg border border-positive/25 py-2"
                style={{ opacity: room > 0 ? 1 : 0.5 }}
              >
                <Text className="text-[12px] text-positive">Take {fmt(room)} as cash</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
