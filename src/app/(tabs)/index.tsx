import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { TodaySummaryCard } from "@/components/home/TodaySummaryCard";
import { CoachStrip } from "@/components/home/CoachStrip";
import { PotCard } from "@/components/home/PotCard";
import { FixedExpensesSection } from "@/components/home/FixedExpensesSection";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod, listMonths } from "@/lib/period";
import { confirmFixedExpense, unconfirmFixedExpense } from "@/lib/fixedExpenses";
import {
  TRANSACTION_COLUMNS,
  fixedExpenseDefFromRow,
  fmt,
  monthBalance,
  monthKeyToLabel,
  potFromRow,
  potSpent,
  sumItems,
  transactionFromRow,
  type FixedExpenseDef,
  type Period,
  type Pot,
  type Transaction,
} from "@/lib/types";

export default function HomeScreen() {
  const { householdId } = useHousehold();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [viewedIndex, setViewedIndex] = useState(0);
  const [pots, setPots] = useState<Pot[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseDef[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachDismissed, setCoachDismissed] = useState(false);

  const viewedPeriod = periods[viewedIndex] ?? null;
  const isOpen = viewedIndex === 0;

  const loadTransactions = useCallback(async (periodId: string) => {
    const { data } = await supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("period_id", periodId)
      .order("date", { ascending: false });
    setTransactions((data ?? []).map(transactionFromRow));
  }, []);

  const loadStructure = useCallback(async () => {
    if (!householdId) return;
    await ensureOpenPeriod(supabase, householdId);
    const [allPeriods, { data: potData }, { data: fixedData }] = await Promise.all([
      listMonths(supabase, householdId),
      supabase
        .from("pots")
        .select("id, household_id, name, spend_limit, archived_at")
        .eq("household_id", householdId)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("fixed_expenses")
        .select("id, household_id, category_id, name, amount, active")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
    ]);
    setPeriods(allPeriods);
    setPots((potData ?? []).map(potFromRow));
    setFixedExpenses((fixedData ?? []).map(fixedExpenseDefFromRow));
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    loadStructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  useEffect(() => {
    if (viewedPeriod) loadTransactions(viewedPeriod.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedPeriod?.id]);

  // Quick Add and Settings write to this same household from separate
  // routes — re-load on every focus so a just-added transaction, pot,
  // category, or fixed expense shows up the moment the user backs out.
  useFocusEffect(
    useCallback(() => {
      loadStructure();
      if (viewedPeriod) loadTransactions(viewedPeriod.id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewedPeriod?.id, loadStructure])
  );

  if (loading || !viewedPeriod) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const cashInTotal = sumItems(transactions.filter((t) => t.type === "in"));
  const cashOutTotal = sumItems(transactions.filter((t) => t.type === "out"));
  const balance = monthBalance(viewedPeriod, transactions);
  const potAllocation = pots.reduce((s, p) => s + p.spendLimit, 0);
  const fixedExpensesTotal = sumItems(fixedExpenses);

  const potsOver = pots.filter((p) => p.spendLimit > 0 && potSpent(p.id, transactions) > p.spendLimit);

  let coachText = "";
  if (potsOver.length > 0) {
    const op = potsOver[0];
    coachText = `${op.name} is ${fmt(potSpent(op.id, transactions) - op.spendLimit)} past its limit.`;
  }
  const showCoach = !coachDismissed && !!coachText;

  const confirmFixed = async (fe: FixedExpenseDef) => {
    if (!viewedPeriod) return;
    const txn = await confirmFixedExpense(supabase, viewedPeriod, fe);
    setTransactions((cur) => [txn, ...cur]);
  };

  const unconfirmFixed = async (fe: FixedExpenseDef) => {
    if (!viewedPeriod) return;
    await unconfirmFixedExpense(supabase, viewedPeriod.id, fe.id);
    setTransactions((cur) => cur.filter((t) => t.fixedExpenseId !== fe.id));
  };

  return (
    <Screen>
      <View className="px-4 pb-10 pt-3">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-[22px] text-gold">Ledger</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setViewedIndex((i) => Math.min(periods.length - 1, i + 1))}
              disabled={viewedIndex >= periods.length - 1}
              hitSlop={8}
              style={{ opacity: viewedIndex >= periods.length - 1 ? 0.3 : 1 }}
            >
              <Text className="text-[13px] text-muted">‹</Text>
            </Pressable>
            <Text className="font-mono text-[11px] uppercase tracking-wider text-muted">
              {monthKeyToLabel(viewedPeriod.monthKey)}
            </Text>
            <Pressable
              onPress={() => setViewedIndex((i) => Math.max(0, i - 1))}
              disabled={isOpen}
              hitSlop={8}
              style={{ opacity: isOpen ? 0.3 : 1 }}
            >
              <Text className="text-[13px] text-muted">›</Text>
            </Pressable>
          </View>
        </View>
        <View className="mt-1 flex-row items-center justify-end gap-3">
          {!isOpen && <Text className="text-[10.5px] text-muted2">Viewing a past month — read only</Text>}
          <Pressable onPress={() => router.push("/activity")} hitSlop={6}>
            <Text className="text-[10.5px] text-muted2 underline">Activity ›</Text>
          </Pressable>
        </View>

        <View className="mt-3">
          <TodaySummaryCard
            balance={balance}
            cashIn={cashInTotal}
            cashOut={cashOutTotal}
            potAllocation={potAllocation}
            fixedExpensesTotal={fixedExpensesTotal}
          />
        </View>

        {showCoach && <CoachStrip text={coachText} onDismiss={() => setCoachDismissed(true)} />}

        <View className="mb-2.5 mt-5 flex-row items-center justify-between">
          <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">Pots</Text>
          {potsOver.length > 0 && (
            <Text className="font-mono text-[11px] text-muted2">{potsOver.length} over limit</Text>
          )}
        </View>
        <View className="gap-2">
          {pots.map((pot) => (
            <PotCard
              key={pot.id}
              pot={pot}
              transactions={transactions.filter((t) => t.potId === pot.id)}
              onPress={() => router.push(`/activity?pot=${pot.id}`)}
            />
          ))}
          {pots.length === 0 && (
            <Text className="text-[12.5px] text-muted2">No pots yet — add one from Settings.</Text>
          )}
        </View>

        <FixedExpensesSection
          fixedExpenses={fixedExpenses}
          transactionsThisPeriod={transactions}
          onConfirm={confirmFixed}
          onUnconfirm={unconfirmFixed}
          readOnly={!isOpen}
        />
      </View>
    </Screen>
  );
}
