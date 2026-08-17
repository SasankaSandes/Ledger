import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriodRow } from "@/lib/period";
import {
  debtBalance,
  fmt,
  shortDate,
  sumItems,
  todayKey,
  totalOwed,
  uid,
  type BudgetItem,
  type Debt,
  type HouseholdSettings,
} from "@/lib/types";

// Self-contained like ClosePeriodPanel/SavingsSection — owns its own list
// state and Supabase mutations, ported from the archived DebtsView.tsx and
// extended for partial repayment (which the old version didn't support).
export function DebtsSection({
  householdId,
  settings,
  initialDebts,
}: {
  householdId: string;
  settings: HouseholdSettings;
  initialDebts: Debt[];
}) {
  const [debts, setDebts] = useState<Debt[]>(initialDebts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const addTopUp = async (desc: string, amount: number) => {
    const { month, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);
    const topUp: BudgetItem = { id: uid(), desc, amount, date: todayKey() };
    await supabase
      .from("budgets")
      .update({ top_ups: [...monthly.topUps, topUp], updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("month", month);
  };

  const addDebt = async () => {
    const name = newName.trim();
    const amount = Number(newAmount.replace(/[^0-9.]/g, ""));
    if (!name || !amount) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("debts")
      .insert({ household_id: householdId, name, amount, date: todayKey(), repayments: [] })
      .select("id, name, amount, date, paid_at, repayments")
      .single();
    if (!error && data) {
      setDebts((ds) => [
        ...ds,
        { id: data.id, name: data.name, amount: data.amount, date: data.date, paidAt: data.paid_at, repayments: data.repayments },
      ]);
      // Borrowed/owed money is spendable now — it becomes a top-up.
      await addTopUp(`Owed: ${name}`, amount);
      setNewName("");
      setNewAmount("");
    }
    setBusy(false);
  };

  // Clamped to the remaining balance; auto-settles (sets paidAt) once the
  // resulting balance hits zero. "Pay all" is just repay(debt, balance).
  const repay = async (debt: Debt, amount: number) => {
    const amt = Math.min(amount, debtBalance(debt));
    if (amt <= 0) return;
    setBusy(true);
    const repayment: BudgetItem = { id: uid(), desc: "Repayment", amount: amt, date: todayKey() };
    const repayments = [...debt.repayments, repayment];
    const nextBalance = debt.amount - sumItems(repayments);
    const paidAt = nextBalance <= 0 ? new Date().toISOString() : null;
    await supabase.from("debts").update({ repayments, paid_at: paidAt }).eq("id", debt.id);
    setDebts((ds) => ds.map((d) => (d.id === debt.id ? { ...d, repayments, paidAt } : d)));
    await addTopUp(`Repaid: ${debt.name}`, -amt);
    setBusy(false);
  };

  const removeRepayment = async (debt: Debt, repaymentId: string) => {
    const repayments = debt.repayments.filter((r) => r.id !== repaymentId);
    const nextBalance = debt.amount - sumItems(repayments);
    const paidAt = nextBalance <= 0 ? debt.paidAt : null;
    await supabase.from("debts").update({ repayments, paid_at: paidAt }).eq("id", debt.id);
    setDebts((ds) => ds.map((d) => (d.id === debt.id ? { ...d, repayments, paidAt } : d)));
  };

  const removeDebt = async (debt: Debt) => {
    await supabase.from("debts").delete().eq("id", debt.id);
    setDebts((ds) => ds.filter((d) => d.id !== debt.id));
  };

  const outstanding = debts.filter((d) => !d.paidAt);
  const settled = debts.filter((d) => d.paidAt);
  const owed = totalOwed(debts);

  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between rounded-2xl border border-line/10 bg-card px-4 py-3.5">
        <Text className="text-[12px] uppercase tracking-wider text-muted">You owe</Text>
        <Text className={`font-mono text-[20px] font-body-semibold ${owed > 0 ? "text-negative" : "text-muted"}`}>
          {fmt(owed)}
        </Text>
      </View>

      {outstanding.length === 0 && <Text className="text-[12.5px] text-muted2">Nothing outstanding.</Text>}

      {outstanding.map((d) => (
        <DebtRow
          key={d.id}
          debt={d}
          expanded={expandedId === d.id}
          busy={busy}
          onToggle={() => setExpandedId((cur) => (cur === d.id ? null : d.id))}
          onRepay={(amount) => repay(d, amount)}
          onPayAll={() => repay(d, debtBalance(d))}
          onRemoveRepayment={(id) => removeRepayment(d, id)}
        />
      ))}

      <View className="flex-row gap-1.5">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Loan from Kasun"
          placeholderTextColor="#5C6070"
          className="flex-1 rounded-lg border border-line/10 bg-input px-3 py-2.5 text-[12.5px] text-text"
        />
        <TextInput
          value={newAmount}
          onChangeText={setNewAmount}
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor="#5C6070"
          onSubmitEditing={addDebt}
          className="w-24 rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-right font-mono text-[12.5px] text-text"
        />
        <Pressable onPress={addDebt} className="w-11 items-center justify-center rounded-lg bg-fill">
          <Text className="text-[16px] text-gold">+</Text>
        </Pressable>
      </View>

      {settled.length > 0 && (
        <View className="mt-2">
          <Text className="mb-2 text-[11px] uppercase tracking-wider text-muted2">Settled</Text>
          <View className="gap-1.5">
            {settled.map((d) => (
              <View
                key={d.id}
                className="flex-row items-center gap-2.5 rounded-xl border border-line/5 bg-card2 px-3.5 py-2.5"
              >
                <Text className="flex-1 text-[12.5px] text-muted2">{d.name}</Text>
                <Text className="font-mono text-[12px] text-muted2">{d.amount.toLocaleString()}</Text>
                <Pressable onPress={() => removeDebt(d)} hitSlop={8}>
                  <Text className="px-0.5 text-[14px] text-faint">×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function DebtRow({
  debt,
  expanded,
  busy,
  onToggle,
  onRepay,
  onPayAll,
  onRemoveRepayment,
}: {
  debt: Debt;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onRepay: (amount: number) => void;
  onPayAll: () => void;
  onRemoveRepayment: (repaymentId: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const paid = sumItems(debt.repayments);
  const remaining = debtBalance(debt);
  const pct = debt.amount > 0 ? Math.min(100, (paid / debt.amount) * 100) : 0;

  const submitRepay = () => {
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    if (!amt) return;
    onRepay(amt);
    setAmount("");
  };

  return (
    <View className="overflow-hidden rounded-[13px] border border-line/10 bg-card">
      <Pressable onPress={onToggle} className="px-3.5 py-3.5">
        <View className="flex-row items-baseline justify-between">
          <Text className="flex-1 font-body-medium text-[13.5px] text-text" numberOfLines={1}>
            {debt.name}
          </Text>
          <Text className="font-mono text-[13px] text-negative">{fmt(remaining)}</Text>
        </View>
        <View className="mt-1 flex-row items-baseline justify-between">
          <Text className="font-mono text-[10.5px] text-muted2">{shortDate(debt.date)}</Text>
          <Text className="font-mono text-[10.5px] text-muted">
            {paid.toLocaleString()} of {debt.amount.toLocaleString()} paid
          </Text>
        </View>
        <View className="mt-2 h-1 overflow-hidden rounded bg-fill">
          <View className="h-1 rounded bg-positive" style={{ width: `${pct}%` }} />
        </View>
      </Pressable>

      {expanded && (
        <View className="px-3.5 pb-3.5">
          <View className="mb-2.5 h-px bg-line/10" />

          {debt.repayments.length === 0 ? (
            <Text className="pb-2 text-[12px] text-muted2">No repayments yet.</Text>
          ) : (
            [...debt.repayments].reverse().map((r) => (
              <View key={r.id} className="flex-row items-center gap-2.5 py-1.5">
                <Text className="flex-1 text-[12.5px] text-text2">{r.desc}</Text>
                <Text className="font-mono text-[10.5px] text-muted2">{shortDate(r.date)}</Text>
                <Text className="min-w-[64px] text-right font-mono text-[12.5px] text-positive">
                  {r.amount.toLocaleString()}
                </Text>
                <Pressable onPress={() => onRemoveRepayment(r.id)} hitSlop={8}>
                  <Text className="px-0.5 text-[14px] text-faint">×</Text>
                </Pressable>
              </View>
            ))
          )}

          <View className="mt-2.5 flex-row gap-[7px]">
            <TextInput
              value={amount}
              onChangeText={setAmount}
              inputMode="numeric"
              placeholder="amount"
              placeholderTextColor="#5C6070"
              onSubmitEditing={submitRepay}
              className="flex-1 rounded-lg border border-line/10 bg-input px-2.5 py-2.5 text-right font-mono text-[12.5px] text-text"
            />
            <Pressable
              onPress={submitRepay}
              disabled={busy}
              className="items-center justify-center rounded-lg bg-fill px-3.5"
            >
              <Text className="text-[12px] text-positive">Record</Text>
            </Pressable>
            <Pressable
              onPress={onPayAll}
              disabled={busy}
              className="items-center justify-center rounded-lg border border-line/15 px-3"
            >
              <Text className="text-[12px] text-muted">Pay all</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
