import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import {
  FIXED_EXPENSE_COLUMNS,
  TRANSACTION_COLUMNS,
  categoryFromRow,
  fixedExpenseDefFromRow,
  fmt,
  fmtExact,
  potFromRow,
  potSpent,
  transactionFromRow,
  type Category,
  type FixedExpenseDef,
  type Pot,
  type Transaction,
} from "@/lib/types";

// The full Pots (budget) list, plus Fixed Expenses — CRUD stays in Settings;
// tapping a pot here jumps to its full history in Activity, matching the
// Home-logs vs. Settings-edits split.
export default function PotsScreen() {
  const { householdId } = useHousehold();
  const [pots, setPots] = useState<Pot[]>([]);
  const [outCategories, setOutCategories] = useState<Category[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseDef[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    const period = await ensureOpenPeriod(supabase, householdId);
    const [{ data: potData }, { data: catData }, { data: fixedData }, { data: txnData }] = await Promise.all([
      supabase
        .from("pots")
        .select("id, household_id, name, spend_limit, archived_at")
        .eq("household_id", householdId)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("categories")
        .select("id, household_id, name, type, archived_at")
        .eq("household_id", householdId)
        .eq("type", "out")
        .order("created_at", { ascending: true }),
      supabase
        .from("fixed_expenses")
        .select(FIXED_EXPENSE_COLUMNS)
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabase.from("transactions").select(TRANSACTION_COLUMNS).eq("period_id", period.id),
    ]);
    setPots((potData ?? []).map(potFromRow));
    setOutCategories((catData ?? []).map(categoryFromRow));
    setFixedExpenses((fixedData ?? []).map(fixedExpenseDefFromRow));
    setTransactions((txnData ?? []).map(transactionFromRow));
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="px-4 pb-10 pt-3">
        <Text className="font-display text-[22px] text-text">Pots</Text>
        <Text className="mt-1 text-[12px] text-muted">Budgets this month. Tap one to see its full history.</Text>

        <View className="mt-4 gap-2">
          {pots.map((pot) => {
            const spent = potSpent(pot.id, transactions);
            const cap = pot.spendLimit;
            const over = cap > 0 && spent > cap;
            return (
              <Pressable
                key={pot.id}
                onPress={() => router.push(`/activity?pot=${pot.id}`)}
                className="rounded-[13px] border border-line/10 bg-card px-3.5 py-3.5"
              >
                <View className="flex-row items-baseline gap-2">
                  <Text className="font-body-medium text-[13.5px] text-text">{pot.name}</Text>
                  <View className="flex-1" />
                  <Text className={`font-mono text-[12.5px] ${over ? "text-negative" : "text-text"}`}>
                    {fmt(spent)}
                  </Text>
                  <Text className="font-mono text-[11px] text-muted2">
                    {cap > 0 ? `/ ${cap.toLocaleString()}` : "/ no limit"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {pots.length === 0 && <Text className="text-[12.5px] text-muted2">No pots yet — add one from Settings.</Text>}
        </View>

        {fixedExpenses.length > 0 && (
          <>
            <Text className="mb-2.5 mt-6 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
              Fixed expenses
            </Text>
            <View className="rounded-[13px] border border-line/10 bg-card px-3.5">
              {fixedExpenses.map((f, i) => {
                const category = outCategories.find((c) => c.id === f.categoryId);
                return (
                  <View
                    key={f.id}
                    className={`flex-row items-center gap-2.5 py-2.5 ${i < fixedExpenses.length - 1 ? "border-b border-line/5" : ""}`}
                  >
                    <View className="flex-1">
                      <Text className="text-[13px] text-text2">{f.name}</Text>
                      <Text className="text-[10.5px] text-muted2">{category?.name ?? "—"}</Text>
                    </View>
                    <Text className="font-mono text-[12.5px] text-text">{fmtExact(f.amount)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
