"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  allocatedTotal,
  fmt,
  sumItems,
  type BudgetItem,
  type FixedExpense,
  type HouseholdSettings,
  type LedgerState,
} from "@/lib/types";
import Ring from "./Ring";
import StubRow from "./StubRow";
import BudgetCategory from "./BudgetCategory";
import AllowanceCard from "./AllowanceCard";
import AmountInput from "./AmountInput";
import ClosePeriodPanel from "./ClosePeriodPanel";

const DEBOUNCE_MS = 500;

export default function Ledger({
  householdId,
  month,
  year,
  settings,
  initialState,
  periodStale,
  savingsCollections,
  outstandingDebtTotal,
}: {
  householdId: string;
  month: string;
  year: number;
  settings: HouseholdSettings;
  initialState: LedgerState;
  periodStale: boolean;
  savingsCollections: { id: string; name: string }[];
  outstandingDebtTotal: number;
}) {
  const [state, setState] = useState<LedgerState>(initialState);
  const [saving, setSaving] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Salary/fixed/budget/monthly-allowances all live on the current month's
  // budgets row. Annual allowances have no per-month row of their own — only
  // their usage/cashout items, in allowance_periods, keyed by year.
  const persistBudgets = useCallback(
    async (next: LedgerState) => {
      setSaving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("budgets")
        .update({
          salary: next.salary,
          fixed: next.fixed,
          budget: next.budget,
          allowances: next.allowances.filter((a) => a.period === "monthly"),
          top_ups: next.topUps,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", householdId)
        .eq("month", month);
      if (error) console.error("save failed", error);
      setSaving(false);
    },
    [householdId, month]
  );

  const persistAnnualItems = useCallback(
    async (allowanceId: string, patch: { usageItems: BudgetItem[]; cashoutItems: BudgetItem[] }) => {
      setSaving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("allowance_periods")
        .update({
          usage_items: patch.usageItems,
          cashout_items: patch.cashoutItems,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", householdId)
        .eq("allowance_id", allowanceId)
        .eq("period_year", year);
      if (error) console.error("save failed", error);
      setSaving(false);
    },
    [householdId, year]
  );

  const update = (next: LedgerState, opts?: { debounce?: boolean }) => {
    setState(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (opts?.debounce) {
      debounceRef.current = setTimeout(() => persistBudgets(next), DEBOUNCE_MS);
    } else {
      persistBudgets(next);
    }
  };

  useEffect(() => {
    const timer = debounceRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const fixedTotal = state.fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
  const fixedPaid = state.fixed
    .filter((f) => f.paid)
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  const budgetSpentTotal = state.budget.reduce((s, b) => s + sumItems(b.items), 0);
  const totalSpent = fixedPaid + budgetSpentTotal;
  const topUpsTotal = sumItems(state.topUps);
  const effectiveSalary = state.salary + topUpsTotal;
  const moneyLeft = effectiveSalary - totalSpent;
  const overallSpentPct = effectiveSalary > 0 ? totalSpent / effectiveSalary : 0;
  const unallocated = effectiveSalary - allocatedTotal(state);
  const overAllocated = unallocated < 0;
  // Only monthly-period allowances reset when this period closes — annual
  // ones keep their own running balance regardless, so their cash in hand
  // isn't part of what closing needs to place.
  const cashInHand = state.allowances
    .filter((a) => a.period === "monthly")
    .reduce((s, a) => s + sumItems(a.cashoutItems), 0);

  const setFixed = (id: string, patch: Partial<FixedExpense>) =>
    update(
      { ...state, fixed: state.fixed.map((f) => (f.id === id ? { ...f, ...patch } : f)) },
      { debounce: "amount" in patch }
    );
  const setSalary = (val: number) => update({ ...state, salary: val }, { debounce: true });

  const addBudgetItem = (catId: string, item: BudgetItem) =>
    update({
      ...state,
      budget: state.budget.map((b) =>
        b.id === catId ? { ...b, items: [...b.items, item] } : b
      ),
    });
  const removeBudgetItem = (catId: string, itemId: string) =>
    update({
      ...state,
      budget: state.budget.map((b) =>
        b.id === catId ? { ...b, items: b.items.filter((i) => i.id !== itemId) } : b
      ),
    });
  const setBudgetCap = (catId: string, amount: number) =>
    update(
      { ...state, budget: state.budget.map((b) => (b.id === catId ? { ...b, amount } : b)) },
      { debounce: true }
    );

  // Allowance mutations branch on period: monthly instances ride along with
  // the rest of the budgets row (debounced/immediate like fixed & budget);
  // annual instances write straight to allowance_periods.
  const patchAllowance = (
    id: string,
    build: (a: LedgerState["allowances"][number]) => Partial<LedgerState["allowances"][number]>,
    opts?: { debounce?: boolean }
  ) => {
    const current = state.allowances.find((a) => a.id === id);
    if (!current) return;
    const patched = { ...current, ...build(current) };
    const nextAllowances = state.allowances.map((a) => (a.id === id ? patched : a));
    const next = { ...state, allowances: nextAllowances };
    setState(next);

    if (current.period === "monthly") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (opts?.debounce) {
        debounceRef.current = setTimeout(() => persistBudgets(next), DEBOUNCE_MS);
      } else {
        persistBudgets(next);
      }
    } else {
      persistAnnualItems(id, { usageItems: patched.usageItems, cashoutItems: patched.cashoutItems });
    }
  };

  const setAllowanceAmount = (id: string, amount: number) =>
    patchAllowance(id, () => ({ amount }), { debounce: true });
  const addAllowanceUsage = (id: string, item: BudgetItem) =>
    patchAllowance(id, (a) => ({ usageItems: [...a.usageItems, item] }));
  const removeAllowanceUsage = (id: string, itemId: string) =>
    patchAllowance(id, (a) => ({ usageItems: a.usageItems.filter((i) => i.id !== itemId) }));
  const addAllowanceCashout = (id: string, item: BudgetItem) =>
    patchAllowance(id, (a) => ({ cashoutItems: [...a.cashoutItems, item] }));
  const removeAllowanceCashout = (id: string, itemId: string) =>
    patchAllowance(id, (a) => ({ cashoutItems: a.cashoutItems.filter((i) => i.id !== itemId) }));

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "#101218",
        minHeight: "100vh",
        padding: "28px 18px 60px",
        fontFamily: "var(--font-ibm-plex-sans), sans-serif",
        color: "#EDEEF2",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 2,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            Ledger
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11.5, color: "#8B8FA0" }}>{monthLabel}</div>
            <Link href="/savings" style={{ fontSize: 11.5, color: "#5A5F6D" }}>
              Savings
            </Link>
            <Link href="/debts" style={{ fontSize: 11.5, color: "#5A5F6D" }}>
              Debts
            </Link>
            <Link href="/settings" style={{ fontSize: 11.5, color: "#5A5F6D" }}>
              Manage
            </Link>
          </div>
        </div>
        <div style={{ fontSize: 11, color: saving ? "#D9A441" : "#5A5F6D", marginBottom: 20, height: 14 }}>
          {saving ? "saving…" : "saved"}
        </div>

        {periodStale && !staleDismissed && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              background: "#171A21",
              border: "1px solid #2C303A",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 12,
              color: "#8B8FA0",
            }}
          >
            <span>Your salary date has passed — close this period when you&rsquo;re ready.</span>
            <button
              onClick={() => setStaleDismissed(true)}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "#5A5F6D", cursor: "pointer", fontSize: 13, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        )}

        <ClosePeriodPanel
          householdId={householdId}
          settings={settings}
          month={month}
          unallocated={Math.max(unallocated, 0)}
          cashInHand={cashInHand}
          savingsCollections={savingsCollections}
          outstandingDebtTotal={outstandingDebtTotal}
        />

        <div
          style={{
            background: "#171A21",
            border: "1px solid #23262F",
            borderRadius: 16,
            padding: "22px 20px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 18,
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Ring pct={overallSpentPct} color={overallSpentPct > 1 ? "#E0664F" : "#D9A441"} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontFamily: "var(--font-ibm-plex-mono), monospace",
              }}
            >
              {Math.round(overallSpentPct * 100)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "#8B8FA0", marginBottom: 2 }}>Salary</div>
            <AmountInput
              style={{ width: 110, fontSize: 18, textAlign: "left", borderBottom: "1px solid #2C303A" }}
              value={state.salary}
              onChange={(n) => setSalary(n ?? 0)}
            />
            {topUpsTotal > 0 && (
              <div style={{ fontSize: 11, color: "#D9A441", marginTop: 4 }}>
                + {fmt(topUpsTotal)} from top-ups this period
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: overAllocated ? "rgba(224,102,79,0.1)" : "rgba(217,164,65,0.08)",
            border: "1px solid " + (overAllocated ? "#E0664F" : "#23262F"),
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 12, color: overAllocated ? "#E0664F" : "#8B8FA0" }}>
            {overAllocated ? "Over-allocated" : "Unallocated"}
          </span>
          <span className="num" style={{ fontSize: 14, color: overAllocated ? "#E0664F" : "#6FCF97" }}>
            {fmt(Math.abs(unallocated))}
          </span>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, background: "#171A21", border: "1px solid #23262F", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8FA0", marginBottom: 4 }}>Money spent</div>
            <div className="num" style={{ fontSize: 17 }}>{fmt(totalSpent)}</div>
          </div>
          <div style={{ flex: 1, background: "#171A21", border: "1px solid #23262F", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8FA0", marginBottom: 4 }}>Money left</div>
            <div className="num" style={{ fontSize: 17, color: moneyLeft >= 0 ? "#6FCF97" : "#E0664F" }}>{fmt(moneyLeft)}</div>
          </div>
        </div>

        {state.fixed.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase" }}>Fixed expenses</div>
              <div className="num" style={{ fontSize: 12.5, color: "#8B8FA0" }}>{fmt(fixedPaid)} / {fmt(fixedTotal)}</div>
            </div>
            {state.fixed.map((f) => (
              <StubRow
                key={f.id}
                label={f.name}
                accent="#D9A441"
                done={f.paid}
                right={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AmountInput
                      value={f.amount}
                      onChange={(n) => setFixed(f.id, { amount: n ?? 0 })}
                    />
                    <button
                      onClick={() => setFixed(f.id, { paid: !f.paid })}
                      style={{
                        fontSize: 10.5,
                        padding: "4px 9px",
                        borderRadius: 20,
                        border: "1px solid " + (f.paid ? "#6FCF97" : "#3A3F4B"),
                        background: f.paid ? "rgba(111,207,151,0.12)" : "transparent",
                        color: f.paid ? "#6FCF97" : "#8B8FA0",
                        cursor: "pointer",
                      }}
                    >
                      {f.paid ? "Paid" : "Mark paid"}
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}

        {state.budget.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase" }}>Budget allocation</div>
              <div className="num" style={{ fontSize: 12.5, color: "#8B8FA0" }}>
                {fmt(budgetSpentTotal)} / {fmt(state.budget.reduce((s, b) => s + b.amount, 0))}
              </div>
            </div>
            {state.budget.map((cat) => (
              <BudgetCategory
                key={cat.id}
                cat={cat}
                onAddItem={(item) => addBudgetItem(cat.id, item)}
                onRemoveItem={(itemId) => removeBudgetItem(cat.id, itemId)}
                onCapChange={(amount) => setBudgetCap(cat.id, amount)}
              />
            ))}
          </div>
        )}

        {state.allowances.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase", marginBottom: 6 }}>
              Allowances
            </div>
            {state.allowances.map((a) => (
              <AllowanceCard
                key={a.id}
                allowance={a}
                onAmountChange={a.period === "monthly" ? (amount) => setAllowanceAmount(a.id, amount) : undefined}
                onAddUsage={(item) => addAllowanceUsage(a.id, item)}
                onRemoveUsage={(itemId) => removeAllowanceUsage(a.id, itemId)}
                onAddCashout={(item) => addAllowanceCashout(a.id, item)}
                onRemoveCashout={(itemId) => removeAllowanceCashout(a.id, itemId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
