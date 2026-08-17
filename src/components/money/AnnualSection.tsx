import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import {
  annualCashoutRoom,
  annualRemaining,
  fmt,
  shortDate,
  sumItems,
  todayKey,
  uid,
  type AnnualAllowanceInstance,
  type BudgetItem,
} from "@/lib/types";

const currentYear = new Date().getFullYear();

// Self-contained like SavingsSection/DebtsSection — owns its own list state
// and Supabase mutations. allowance_periods rows have no single-column id
// exposed on the domain type, so mutations target the composite key
// (household_id, allowance_id, period_year) directly.
export function AnnualSection({
  householdId,
  initialInstances,
}: {
  householdId: string;
  initialInstances: AnnualAllowanceInstance[];
}) {
  const [instances, setInstances] = useState<AnnualAllowanceInstance[]>(initialInstances);

  const patch = async (id: string, next: Partial<Pick<AnnualAllowanceInstance, "usageItems" | "cashoutItems">>) => {
    setInstances((cur) => cur.map((a) => (a.id === id ? { ...a, ...next } : a)));
    await supabase
      .from("allowance_periods")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("allowance_id", id)
      .eq("period_year", currentYear);
  };

  const addUsage = (a: AnnualAllowanceInstance, desc: string, amount: number) => {
    const item: BudgetItem = { id: uid(), desc, amount, date: todayKey() };
    patch(a.id, { usageItems: [...a.usageItems, item] });
  };

  const addCashout = (a: AnnualAllowanceInstance, desc: string, amount: number) => {
    const room = annualCashoutRoom(a);
    const clamped = Math.min(amount, room);
    if (clamped <= 0) return;
    const item: BudgetItem = { id: uid(), desc, amount: clamped, date: todayKey() };
    patch(a.id, { cashoutItems: [...a.cashoutItems, item] });
  };

  if (instances.length === 0) {
    return <Text className="text-[12.5px] text-muted2">No annual allowances yet — add one from Manage.</Text>;
  }

  return (
    <View className="gap-2.5">
      {instances.map((a) => (
        <AnnualCard key={a.id} instance={a} onAddUsage={(d, n) => addUsage(a, d, n)} onAddCashout={(d, n) => addCashout(a, d, n)} />
      ))}
    </View>
  );
}

function AnnualCard({
  instance,
  onAddUsage,
  onAddCashout,
}: {
  instance: AnnualAllowanceInstance;
  onAddUsage: (desc: string, amount: number) => void;
  onAddCashout: (desc: string, amount: number) => void;
}) {
  const [usageDesc, setUsageDesc] = useState("");
  const [usageAmt, setUsageAmt] = useState("");
  const [cashDesc, setCashDesc] = useState("");
  const [cashAmt, setCashAmt] = useState("");

  const remaining = annualRemaining(instance);
  const room = annualCashoutRoom(instance);
  const cashedSoFar = sumItems(instance.cashoutItems);

  const submitUsage = () => {
    const amt = Number(usageAmt.replace(/[^0-9.]/g, ""));
    if (!amt) return;
    onAddUsage(usageDesc || instance.name, amt);
    setUsageDesc("");
    setUsageAmt("");
  };

  const submitCashout = () => {
    const amt = Number(cashAmt.replace(/[^0-9.]/g, ""));
    if (!amt) return;
    onAddCashout(cashDesc || "Claimed as cash", amt);
    setCashDesc("");
    setCashAmt("");
  };

  return (
    <View className="rounded-[13px] border border-line/10 bg-card px-3.5 py-3.5">
      <View className="flex-row items-center gap-2">
        <Text className="font-body-medium text-[13.5px] text-text">{instance.name}</Text>
        <View className="rounded bg-info/[0.12] px-[5px] py-[2px]">
          <Text className="font-mono text-[8.5px] tracking-wider text-info">ANNUAL</Text>
        </View>
        <View className="flex-1" />
        <Text className="font-mono text-[11px] text-muted2">{instance.amount.toLocaleString()} / yr</Text>
      </View>

      <View className="mt-2.5 flex-row items-baseline justify-between">
        <Text className="text-[11.5px] text-muted">Left this year</Text>
        <Text className={`font-mono text-[15px] ${remaining < 0 ? "text-negative" : "text-info"}`}>{fmt(remaining)}</Text>
      </View>

      {instance.usageItems.length > 0 && (
        <View className="mt-2">
          {instance.usageItems.map((it) => (
            <View key={it.id} className="flex-row items-center gap-2.5 py-1">
              <Text className="flex-1 text-[12px] text-muted" numberOfLines={1}>
                {it.desc}
              </Text>
              <Text className="font-mono text-[10.5px] text-muted2">{shortDate(it.date)}</Text>
              <Text className="font-mono text-[12px] text-muted">{it.amount.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}
      <View className="mt-2 flex-row gap-[7px]">
        <TextInput
          value={usageDesc}
          onChangeText={setUsageDesc}
          placeholder="description"
          placeholderTextColor="#5C6070"
          className="flex-1 rounded-lg border border-line/10 bg-input px-2.5 py-2 text-[12px] text-text"
        />
        <TextInput
          value={usageAmt}
          onChangeText={setUsageAmt}
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor="#5C6070"
          onSubmitEditing={submitUsage}
          className="w-[70px] rounded-lg border border-line/10 bg-input px-2.5 py-2 text-right font-mono text-[12px] text-text"
        />
        <Pressable onPress={submitUsage} className="w-9 items-center justify-center rounded-lg bg-fill">
          <Text className="text-[15px] text-gold">+</Text>
        </Pressable>
      </View>

      <View className="mt-3 rounded-[10px] border border-positive/25 bg-positive/[0.1] px-3 py-2.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] font-body-medium uppercase tracking-wider text-positive">Cash claimed</Text>
          <Text className="font-mono text-[12.5px] text-positive">{fmt(cashedSoFar)}</Text>
        </View>
        <Text className="mt-0.5 text-[10.5px] text-muted">{fmt(room)} left to claim</Text>
        {instance.cashoutItems.map((ci) => (
          <View key={ci.id} className="flex-row items-center gap-2.5 pt-1">
            <Text className="flex-1 text-[12px] text-muted">{ci.desc}</Text>
            <Text className="font-mono text-[12px] text-muted">{ci.amount.toLocaleString()}</Text>
          </View>
        ))}
        <View className="mt-2 flex-row gap-[7px]">
          <TextInput
            value={cashDesc}
            onChangeText={setCashDesc}
            placeholder="description"
            placeholderTextColor="#5C6070"
            className="flex-1 rounded-lg border border-positive/20 bg-bg px-2.5 py-2 text-[12px] text-text"
          />
          <TextInput
            value={cashAmt}
            onChangeText={setCashAmt}
            inputMode="numeric"
            placeholder="0"
            placeholderTextColor="#5C6070"
            onSubmitEditing={submitCashout}
            className="w-[70px] rounded-lg border border-positive/20 bg-bg px-2.5 py-2 text-right font-mono text-[12px] text-text"
          />
          <Pressable
            onPress={submitCashout}
            disabled={room <= 0}
            className="w-9 items-center justify-center rounded-lg border border-positive/25"
            style={{ opacity: room > 0 ? 1 : 0.5 }}
          >
            <Text className="text-[15px] text-positive">+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
