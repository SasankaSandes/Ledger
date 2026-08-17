import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { TodaySummaryCard } from "@/components/home/TodaySummaryCard";
import { CoachStrip } from "@/components/home/CoachStrip";
import { SalaryDatePrompt } from "@/components/home/SalaryDatePrompt";
import { PotCard } from "@/components/home/PotCard";
import { FixedExpensesSection } from "@/components/home/FixedExpensesSection";
import { ClosePeriodPanel, type Pool, type SavingsCollectionOption } from "@/components/home/ClosePeriodPanel";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { closeOpenPeriod, ensureOpenPeriodRow, type ForwardLineItem } from "@/lib/period";
import {
  allocatedTotal,
  cashInHand,
  committedButUnspent,
  daysToSalary as computeDaysToSalary,
  fmt,
  monthLabel,
  periodKey,
  potRemaining,
  potSpent,
  safeToSpendPerDay,
  sumItems,
  todayKey,
  uid,
  type BudgetItem,
  type LedgerState,
} from "@/lib/types";

export default function HomeScreen() {
  const { householdId, settings } = useHousehold();
  const [month, setMonth] = useState<string | null>(null);
  const [state, setState] = useState<LedgerState | null>(null);
  const [collections, setCollections] = useState<SavingsCollectionOption[]>([]);
  const [openPot, setOpenPot] = useState<string | null>(null);
  const [fixedOpen, setFixedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [saleryPromptDismissed, setSalaryPromptDismissed] = useState(false);

  const loadCollections = useCallback(async (hid: string) => {
    const { data } = await supabase
      .from("savings_collections")
      .select("id, name")
      .eq("household_id", hid)
      .order("created_at", { ascending: true });
    setCollections((data ?? []).map((c) => ({ id: c.id, name: c.name })));
  }, []);

  const loadPeriod = useCallback(async () => {
    if (!householdId) return;
    const { month: m, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);
    setMonth(m);
    setState(monthly);
    await loadCollections(householdId);
  }, [householdId, settings, loadCollections]);

  useEffect(() => {
    loadPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  // Money (savings/debts) can write top-ups to this same open period while
  // Home sits in the background — re-load on every focus so state.topUps
  // (and everything derived from it) doesn't go stale, which matters most
  // right before Close Period computes what to carry forward.
  useFocusEffect(
    useCallback(() => {
      loadPeriod();
    }, [loadPeriod])
  );

  const persist = useCallback(
    async (next: LedgerState) => {
      if (!householdId || !month) return;
      setSaving(true);
      await supabase
        .from("budgets")
        .update({
          // top_ups deliberately omitted: Home never mutates top-ups itself
          // (only reads them), and Money's savings/debts actions write to
          // this same column independently. Including a stale local copy
          // here would clobber whatever Money most recently wrote — see
          // SavingsSection/DebtsSection.
          salary: next.salary,
          fixed: next.fixed,
          pots: next.pots,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", householdId)
        .eq("month", month);
      setSaving(false);
    },
    [householdId, month]
  );

  const update = (next: LedgerState) => {
    setState(next);
    persist(next);
  };

  if (!state || !month) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const fixedPaid = state.fixed.filter((f) => f.paid).reduce((s, f) => s + Number(f.amount || 0), 0);
  const potSpendTotal = state.pots.reduce((s, p) => s + sumItems(p.spendItems), 0);
  const totalSpent = fixedPaid + potSpendTotal;
  const topUpsTotal = sumItems(state.topUps);
  const effectiveSalary = state.salary + topUpsTotal;
  const moneyLeft = effectiveSalary - totalSpent;
  const spentPct = effectiveSalary > 0 ? totalSpent / effectiveSalary : 0;
  const unallocated = effectiveSalary - allocatedTotal(state);
  const cashHand = cashInHand(state.pots);

  const days = computeDaysToSalary(settings.salaryDate);
  const committed = committedButUnspent(state.fixed, state.pots);
  const spendableLeft = moneyLeft - committed;
  const perDay = safeToSpendPerDay(moneyLeft, committed, days);

  const potsOver = state.pots.filter((p) => p.cap > 0 && potSpent(p) > p.cap);
  let coachText = "";
  if (potsOver.length > 0) {
    const op = potsOver[0];
    coachText = `${op.name} is ${fmt(potSpent(op) - op.cap)} past its cap with ${days} days to payday.`;
  } else if (unallocated > 0) {
    coachText = `On track to close with about ${fmt(unallocated)} unallocated.`;
  }
  const showCoach = !coachDismissed && !!coachText;

  // Salary is "due" once today's actual period (given salaryDate) has
  // moved past the one that's still open — i.e. the salary date has
  // already passed for this period and it hasn't been closed yet.
  const salaryDue = periodKey(settings.salaryDate) !== month;

  const addSpend = (potId: string, desc: string, amount: number) => {
    const item: BudgetItem = { id: uid(), desc, amount, date: todayKey() };
    update({
      ...state,
      pots: state.pots.map((p) => (p.id === potId ? { ...p, spendItems: [item, ...p.spendItems] } : p)),
    });
  };
  const removeSpend = (potId: string, itemId: string) => {
    update({
      ...state,
      pots: state.pots.map((p) =>
        p.id === potId ? { ...p, spendItems: p.spendItems.filter((i) => i.id !== itemId) } : p
      ),
    });
  };
  const cashOut = (potId: string, amount: number) => {
    const item: BudgetItem = { id: uid(), desc: "Claimed as cash", amount, date: todayKey() };
    update({
      ...state,
      pots: state.pots.map((p) => (p.id === potId ? { ...p, cashoutItems: [item, ...p.cashoutItems] } : p)),
    });
  };
  const setFixedPaid = (id: string, paid: boolean) => {
    update({ ...state, fixed: state.fixed.map((f) => (f.id === id ? { ...f, paid } : f)) });
  };

  const pools: Pool[] = [];
  if (unallocated > 0) pools.push({ key: "unallocated", label: "Unallocated salary", amount: unallocated });
  if (cashHand > 0) pools.push({ key: "cashInHand", label: "Cash in hand", amount: cashHand });

  const confirmClose = async (forwardItems: ForwardLineItem[]) => {
    if (!householdId || !month) return;
    await closeOpenPeriod(supabase, householdId, settings, { month }, forwardItems);
    await loadPeriod();
  };

  return (
    <Screen>
      <View className="px-4 pb-10 pt-3">
        <View className="flex-row items-baseline justify-between">
          <View className="flex-row items-baseline gap-2">
            <Text className="font-display text-[22px] text-gold">Ledger</Text>
            <Pressable onPress={() => router.push("/history")}>
              <Text className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {monthLabel(new Date(`${month}-01T00:00:00`))} ▾
              </Text>
            </Pressable>
          </View>
          <Text className="font-mono text-[10.5px] text-muted2">{saving ? "saving…" : "saved"}</Text>
        </View>

        {salaryDue && !saleryPromptDismissed && (
          <SalaryDatePrompt onClose={() => setSalaryPromptDismissed(true)} />
        )}

        <View className="mt-3">
          <TodaySummaryCard
            safePerDay={perDay}
            spendableTotal={spendableLeft}
            daysToSalary={days}
            spentPct={spentPct}
            totalSpent={totalSpent}
            moneyLeft={moneyLeft}
          />
        </View>

        {showCoach && <CoachStrip text={coachText} onDismiss={() => setCoachDismissed(true)} />}

        <View className="mb-2.5 mt-5 flex-row items-center justify-between">
          <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">Pots</Text>
          <Text className="font-mono text-[11px] text-muted2">
            {potsOver.length > 0 ? `${potsOver.length} over cap` : "all on pace"}
          </Text>
        </View>
        <View className="gap-2">
          {state.pots.map((pot) => (
            <PotCard
              key={pot.id}
              pot={pot}
              expanded={openPot === pot.id}
              onToggle={() => setOpenPot((cur) => (cur === pot.id ? null : pot.id))}
              onAddSpend={(desc, amount) => addSpend(pot.id, desc, amount)}
              onRemoveSpend={(itemId) => removeSpend(pot.id, itemId)}
              onCashOut={(amount) => cashOut(pot.id, amount)}
            />
          ))}
          {state.pots.length === 0 && (
            <Text className="text-[12.5px] text-muted2">No pots yet — add one from Manage.</Text>
          )}
        </View>

        <Pressable onPress={() => setFixedOpen((v) => !v)} className="mt-5 flex-row items-center justify-between">
          <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">
            Fixed expenses
          </Text>
          <Text className="font-mono text-[11px] text-muted2">{fixedOpen ? "hide" : "show"}</Text>
        </Pressable>
        {fixedOpen && <FixedExpensesSection fixed={state.fixed} onTogglePaid={setFixedPaid} />}

        <View
          className={`mt-5 flex-row items-center justify-between rounded-xl border px-3.5 py-3.5 ${
            unallocated < 0 ? "border-negative/30 bg-negative/10" : "border-line/10 bg-card"
          }`}
        >
          <Text className="text-[12.5px] text-text2">{unallocated < 0 ? "Over-allocated" : "Unallocated"}</Text>
          <Text className={`font-mono text-[15px] font-body-semibold ${unallocated < 0 ? "text-negative" : "text-gold"}`}>
            {fmt(unallocated)}
          </Text>
        </View>

        {householdId && (
          <ClosePeriodPanel
            pools={pools}
            savingsCollections={collections}
            householdId={householdId}
            onConfirm={confirmClose}
          />
        )}
      </View>
    </Screen>
  );
}
