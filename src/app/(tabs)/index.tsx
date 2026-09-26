import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { TodaySummaryCard } from "@/components/home/TodaySummaryCard";
import { CoachStrip } from "@/components/home/CoachStrip";
import { PotCard } from "@/components/home/PotCard";
import { FixedExpensesSection } from "@/components/home/FixedExpensesSection";
import { CardsSection } from "@/components/home/CardsSection";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod, listMonths } from "@/lib/period";
import { confirmFixedExpense, unconfirmFixedExpense } from "@/lib/fixedExpenses";
import { loadCardBalances, loadCards } from "@/lib/cards";
import { round2 } from "@/lib/amount";
import {
  FIXED_EXPENSE_COLUMNS,
  TRANSACTION_COLUMNS,
  cardOwed,
  cardSpent,
  fixedExpenseDefFromRow,
  fmt,
  monthBalance,
  monthKeyToLabel,
  potFromRow,
  potSpent,
  sumCardSpend,
  sumCashIn,
  sumCashOut,
  sumItems,
  transactionFromRow,
  type Card,
  type CardBalance,
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
  const [cards, setCards] = useState<Card[]>([]);
  const [cardBalances, setCardBalances] = useState<Record<string, CardBalance>>({});
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
    const [allPeriods, { data: potData }, { data: fixedData }, cardList, balances] = await Promise.all([
      listMonths(supabase, householdId),
      supabase
        .from("pots")
        .select("id, household_id, name, spend_limit, archived_at")
        .eq("household_id", householdId)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("fixed_expenses")
        .select(FIXED_EXPENSE_COLUMNS)
        .eq("household_id", householdId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      loadCards(supabase, householdId),
      loadCardBalances(supabase, householdId),
    ]);
    setPeriods(allPeriods);
    setPots((potData ?? []).map(potFromRow));
    setCards(cardList);
    setCardBalances(balances);
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

  // Quick Add, Pay card bill and Settings write to this same household from
  // separate routes — re-load on every focus so a just-added transaction,
  // card payment, pot, category, or fixed expense shows up the moment the
  // user backs out.
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

  const cashInTotal = sumCashIn(transactions);
  const cashOutTotal = sumCashOut(transactions);
  const balance = monthBalance(viewedPeriod, transactions);
  const cardsOwedTotal = round2(cards.reduce((s, c) => s + cardOwed(c, cardBalances[c.id]), 0));
  const potAllocation = pots.reduce((s, p) => s + p.spendLimit, 0);
  const fixedExpensesTotal = sumItems(fixedExpenses);

  const potsOver = pots.filter((p) => p.spendLimit > 0 && potSpent(p.id, transactions) > p.spendLimit);

  const cardsOver = cards.filter((c) => c.spendLimit > 0 && cardSpent(c.id, transactions) > c.spendLimit);

  let coachText = "";
  if (potsOver.length > 0) {
    const op = potsOver[0];
    coachText = `${op.name} is ${fmt(potSpent(op.id, transactions) - op.spendLimit)} past its limit.`;
  } else if (cardsOver.length > 0) {
    const oc = cardsOver[0];
    coachText = `${oc.name} is ${fmt(cardSpent(oc.id, transactions) - oc.spendLimit)} past its monthly limit.`;
  }
  const showCoach = !coachDismissed && !!coachText;

  const confirmFixed = async (fe: FixedExpenseDef) => {
    if (!viewedPeriod) return;
    const txn = await confirmFixedExpense(supabase, viewedPeriod, fe);
    setTransactions((cur) => [txn, ...cur]);
    if (fe.cardId && householdId) setCardBalances(await loadCardBalances(supabase, householdId));
  };

  const unconfirmFixed = async (fe: FixedExpenseDef) => {
    if (!viewedPeriod) return;
    await unconfirmFixedExpense(supabase, viewedPeriod.id, fe.id);
    setTransactions((cur) => cur.filter((t) => t.fixedExpenseId !== fe.id));
    if (fe.cardId && householdId) setCardBalances(await loadCardBalances(supabase, householdId));
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
            cards={
              cards.length > 0
                ? { spendThisMonth: sumCardSpend(transactions), owed: cardsOwedTotal }
                : undefined
            }
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

        <CardsSection
          cards={cards}
          transactions={transactions}
          balances={cardBalances}
          onOpen={(card) => router.push(`/activity?card=${card.id}`)}
          onPay={(card) => router.push(`/pay-card?card=${card.id}`)}
          readOnly={!isOpen}
        />

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
