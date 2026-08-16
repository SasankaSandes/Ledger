export type BudgetItem = {
  id: string;
  desc: string;
  amount: number;
  date: string; // ISO YYYY-MM-DD, defaults to today at add time
};

// Durable structure, defined during onboarding and editable anytime after
// from Manage. household_settings carries these; a fresh period's budgets
// row is seeded from them.
export type FixedExpenseDef = {
  id: string;
  name: string;
  amount: number;
};

// A pot replaces the old separate "budget category" (plain spending) and
// "monthly allowance" (spending + cash-out) concepts. `cashable` is the
// only thing that distinguishes them now — a plain pot just tracks spend
// items against a cap; a cashable pot additionally allows claiming
// leftover as cash, optionally capped separately via cashoutCap.
export type PotDef = {
  id: string;
  name: string;
  cap: number;
  cashable: boolean;
  cashoutCap: number | null; // null = uncapped, bounded only by remaining balance
};

// Annual allowances stay a separate concept — a single pool per calendar
// year that persists across every period untouched, tracked via
// allowance_periods rather than resetting on the period's own row.
export type AnnualAllowanceDef = {
  id: string;
  name: string;
  amount: number;
  cashoutCap: number | null;
};

export type HouseholdSettings = {
  salary: number;
  salaryDate: number; // day of month, 1-31 (clamped to the last day of shorter months); defines when a period rolls over
  fixed: FixedExpenseDef[];
  pots: PotDef[];
  annualAllowances: AnnualAllowanceDef[];
};

export const EMPTY_HOUSEHOLD_SETTINGS: HouseholdSettings = {
  salary: 0,
  salaryDate: 1,
  fixed: [],
  pots: [],
  annualAllowances: [],
};

// Named, non-period-scoped savings pot — it just persists and accumulates.
// Balance is always the sum of transactions[].amount, computed on read.
export type SavingsCollection = {
  id: string;
  name: string;
  transactions: BudgetItem[]; // amount: positive = deposit, negative = withdrawal
};

// Per-period instance data (budgets table). Fixed/pots carry structure +
// cap from settings each period but reset paid/items.
export type FixedExpense = FixedExpenseDef & {
  paid: boolean;
};

export type PotRow = PotDef & {
  spendItems: BudgetItem[];
  cashoutItems: BudgetItem[]; // present ([]) even when not cashable, for shape uniformity
};

export type AnnualAllowanceInstance = AnnualAllowanceDef & {
  usageItems: BudgetItem[];
  cashoutItems: BudgetItem[];
};

export type LedgerState = {
  salary: number;
  fixed: FixedExpense[];
  pots: PotRow[];
  // Itemized extra spending money for this period — carried forward from a
  // previous period's leftover, or pulled in from a savings collection.
  topUps: BudgetItem[];
};

export function monthKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(d: Date = new Date()) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function shortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayKey() {
  return monthKey() + "-" + String(new Date().getDate()).padStart(2, "0");
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

// Most recent date on/before `ref` whose day-of-month is `salaryDate`
// (clamped to the last day of shorter months, e.g. 31 -> 28/29 in Feb).
function lastSalaryDateOnOrBefore(salaryDate: number, ref: Date): Date {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const clamped = Math.min(salaryDate, daysInMonth(y, m));
  if (ref.getDate() >= clamped) return new Date(y, m, clamped);
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  return new Date(py, pm, Math.min(salaryDate, daysInMonth(py, pm)));
}

// Nearest date strictly-on-or-after `ref` whose day-of-month is
// `salaryDate` — the mirror of lastSalaryDateOnOrBefore, used for the
// safe-to-spend countdown rather than period rollover.
function nextSalaryDateOnOrAfter(salaryDate: number, ref: Date): Date {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const clamped = Math.min(salaryDate, daysInMonth(y, m));
  if (ref.getDate() <= clamped) return new Date(y, m, clamped);
  const nm = m === 11 ? 0 : m + 1;
  const ny = m === 11 ? y + 1 : y;
  return new Date(ny, nm, Math.min(salaryDate, daysInMonth(ny, nm)));
}

// The current period's key, YYYY-MM of the period's start date. With
// salaryDate=1 this is identical to monthKey() — calendar-month behavior,
// unchanged for anyone who hasn't set a salary date.
export function periodKey(salaryDate: number, ref: Date = new Date()): string {
  return monthKey(lastSalaryDateOnOrBefore(salaryDate, ref));
}

// The period right after `month` ("2026-08" -> "2026-09", rolling the year
// over via Date's normal month overflow). Periods now advance sequentially
// from whichever one is closed, not from what today's date implies — so
// closing early or late never skips or duplicates a period.
export function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(y, m, 1));
}

// Days from today until the next salary date, clamped to a minimum of 1 so
// the safe-to-spend division never hits zero (matches the FRS's "(>= 1)").
export function daysToSalary(salaryDate: number, ref: Date = new Date()): number {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const next = nextSalaryDateOnOrAfter(salaryDate, today);
  const days = Math.round((next.getTime() - today.getTime()) / 86400000);
  return Math.max(1, days);
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function fmt(n: number | undefined) {
  return "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

export function sumItems(items: { amount: number }[]) {
  return items.reduce((s, it) => s + Number(it.amount || 0), 0);
}

// Total logged against a pot — spend plus any cash claimed out of it.
export function potSpent(pot: PotRow): number {
  return sumItems(pot.spendItems) + sumItems(pot.cashoutItems);
}

// Headroom left in a pot, clamped to zero (an uncapped pot, cap=0,
// contributes no headroom — matches how an uncapped budget category
// behaved before pots existed).
export function potRemaining(pot: PotRow): number {
  return Math.max(0, Number(pot.cap || 0) - potSpent(pot));
}

// How much more can be claimed as cash right now — bounded by whatever's
// left under the pot's own cap and, if set, a separate cash-out cap.
export function cashoutRoom(pot: PotRow): number {
  if (!pot.cashable) return 0;
  const cashedSoFar = sumItems(pot.cashoutItems);
  const capRoom = pot.cashoutCap != null ? Math.max(0, pot.cashoutCap - cashedSoFar) : Infinity;
  return Math.max(0, Math.min(capRoom, potRemaining(pot)));
}

// What Close must place — summed across every cashable pot.
export function cashInHand(pots: PotRow[]): number {
  return pots.filter((p) => p.cashable).reduce((s, p) => s + sumItems(p.cashoutItems), 0);
}

// How much of salary is committed to fixed expenses and pot caps. Annual
// allowances are excluded — they're a separate yearly pool, not a draw
// against this period's salary. Works against both HouseholdSettings and
// LedgerState since the relevant fields have the same shape in both.
export function allocatedTotal(input: {
  fixed: { amount: number }[];
  pots: { cap: number }[];
}) {
  const fixedTotal = input.fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
  const potsTotal = input.pots.reduce((s, p) => s + Number(p.cap || 0), 0);
  return fixedTotal + potsTotal;
}

// Money still earmarked for obligations not yet spent: unpaid fixed bills
// in full, plus a "balanced" half-weighting of untouched pot headroom (the
// other half is treated as available to spend today). This directly shapes
// how conservative safe-to-spend feels — the FRS leaves the exact factor a
// product decision; this milestone uses the prototype's simple fixed 0.5
// rather than exposing conservative/balanced/relaxed tuning.
export function committedButUnspent(fixed: FixedExpense[], pots: PotRow[]): number {
  const fixedUnpaid = fixed.filter((f) => !f.paid).reduce((s, f) => s + Number(f.amount || 0), 0);
  const potHeadroom = pots.reduce((s, p) => s + potRemaining(p), 0);
  return fixedUnpaid + potHeadroom * 0.5;
}

// The hero number: how much is safe to spend per day between now and
// salary and still land safe.
export function safeToSpendPerDay(moneyLeft: number, committed: number, days: number): number {
  const spendableLeft = moneyLeft - committed;
  return Math.max(0, spendableLeft) / days;
}

export type MonthlyStructure = {
  salary: number;
  fixed: FixedExpense[];
  pots: PotRow[];
  topUps: BudgetItem[];
};

// Merges household_settings structure into a period's budgets row: names
// and caps always match settings; paid flags and logged items are
// preserved by id when they already exist, and default empty for anything
// new. Used both to seed a brand-new period (existing = null, so top_ups
// start empty) and, from Manage, to cascade a structural edit into the
// already-running current period (existing != null, so whatever top-ups
// were already carried forward or pulled from savings this period are
// preserved, not wiped by an unrelated rename/cap change). A pot's
// spendItems/cashoutItems are preserved unconditionally by id regardless
// of whether its cashable flag has since changed.
export function reconcilePeriodFromSettings(
  settings: HouseholdSettings,
  existing: MonthlyStructure | null
): MonthlyStructure {
  const fixedById = new Map((existing?.fixed ?? []).map((f) => [f.id, f]));
  const fixed = settings.fixed.map((def) => ({
    ...def,
    paid: fixedById.get(def.id)?.paid ?? false,
  }));

  const potById = new Map((existing?.pots ?? []).map((p) => [p.id, p]));
  const pots = settings.pots.map((def) => {
    const found = potById.get(def.id);
    return {
      ...def,
      spendItems: found?.spendItems ?? [],
      cashoutItems: found?.cashoutItems ?? [],
    };
  });

  return {
    salary: existing?.salary ?? settings.salary,
    fixed,
    pots,
    topUps: existing?.topUps ?? [],
  };
}

// DB columns are snake_case (top_ups, salary_date, annual_allowances);
// these types are camelCase. Small mapping helpers instead of relying on
// PostgREST select aliasing, to match this codebase's existing style of
// manually constructing typed objects from raw rows.
export function monthlyStructureFromRow(row: {
  salary: number;
  fixed: FixedExpense[];
  pots: PotRow[];
  top_ups: BudgetItem[];
}): MonthlyStructure {
  return {
    salary: row.salary,
    fixed: row.fixed,
    pots: row.pots,
    topUps: row.top_ups,
  };
}

export function monthlyStructureToRow(m: MonthlyStructure) {
  return { salary: m.salary, fixed: m.fixed, pots: m.pots, top_ups: m.topUps };
}

export function householdSettingsFromRow(row: {
  salary: number;
  salary_date: number;
  fixed: FixedExpenseDef[];
  pots: PotDef[];
  annual_allowances: AnnualAllowanceDef[];
}): HouseholdSettings {
  return {
    salary: row.salary,
    salaryDate: row.salary_date,
    fixed: row.fixed,
    pots: row.pots,
    annualAllowances: row.annual_allowances,
  };
}

export function householdSettingsToRow(s: HouseholdSettings) {
  return {
    salary: s.salary,
    salary_date: s.salaryDate,
    fixed: s.fixed,
    pots: s.pots,
    annual_allowances: s.annualAllowances,
  };
}

export function debtFromRow(row: {
  id: string;
  name: string;
  amount: number;
  date: string;
  paid_at: string | null;
}): Debt {
  return { id: row.id, name: row.name, amount: row.amount, date: row.date, paidAt: row.paid_at };
}

// Money owed to someone else — a loan taken, a bill they covered for you.
// Not period-scoped, persists until paid. Taking one acts like a top-up
// (the money is spendable now); marking it paid is a negative top-up
// (repaying it leaves this period's spending money). Partial installment
// repayment is a Roadmap item — this milestone keeps the existing
// full-payment-only shape.
export type Debt = {
  id: string;
  name: string;
  amount: number;
  date: string;
  paidAt: string | null;
};
