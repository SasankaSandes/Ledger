export type BudgetItem = {
  id: string;
  desc: string;
  amount: number;
  date: string; // ISO YYYY-MM-DD, defaults to today at add time
};

// Durable structure, defined during onboarding and editable anytime after
// from /settings. household_settings carries these; a fresh month's budgets
// row is seeded from them.
export type FixedExpenseDef = {
  id: string;
  name: string;
  amount: number;
};

export type BudgetCategoryDef = {
  id: string;
  name: string;
  amount: number; // monthly cap
};

export type AllowancePeriod = "monthly" | "annual";

export type AllowanceDef = {
  id: string;
  name: string;
  period: AllowancePeriod;
  amount: number;
  cashoutCap: number | null; // null = uncapped, bounded only by remaining balance
};

export type HouseholdSettings = {
  salary: number;
  salaryDate: number; // day of month, 1-31 (clamped to the last day of shorter months); defines when a period rolls over
  fixed: FixedExpenseDef[];
  budget: BudgetCategoryDef[];
  allowances: AllowanceDef[];
};

export const EMPTY_HOUSEHOLD_SETTINGS: HouseholdSettings = {
  salary: 0,
  salaryDate: 1,
  fixed: [],
  budget: [],
  allowances: [],
};

// Named, non-period-scoped savings pot — it just persists and accumulates.
// Balance is always the sum of transactions[].amount, computed on read.
export type SavingsCollection = {
  id: string;
  name: string;
  transactions: BudgetItem[]; // amount: positive = deposit, negative = withdrawal
};

// Per-month instance data (budgets table). Fixed/budget carry structure +
// amount from settings each month but reset paid/items; allowances here are
// monthly-period only (annual ones live solely in allowance_periods).
export type FixedExpense = FixedExpenseDef & {
  paid: boolean;
};

export type BudgetCategoryRow = BudgetCategoryDef & {
  items: BudgetItem[];
};

export type AllowanceInstance = AllowanceDef & {
  usageItems: BudgetItem[];
  cashoutItems: BudgetItem[];
};

export type LedgerState = {
  salary: number;
  fixed: FixedExpense[];
  budget: BudgetCategoryRow[];
  // Merged list for rendering: monthly instances (from budgets.allowances)
  // plus annual instances (derived from settings + allowance_periods).
  // Which store an edit lands in is decided by each instance's `period`.
  allowances: AllowanceInstance[];
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

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function fmt(n: number | undefined) {
  return "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

export function sumItems(items: { amount: number }[]) {
  return items.reduce((s, it) => s + Number(it.amount || 0), 0);
}

// How much of salary is committed to fixed expenses, budget caps, and
// monthly-period allowances. Annual allowances are excluded — they're a
// separate yearly pool, not a draw against this month's salary. Works
// against both HouseholdSettings and LedgerState since the relevant fields
// have the same shape in both.
export function allocatedTotal(input: {
  fixed: { amount: number }[];
  budget: { amount: number }[];
  allowances: { period: AllowancePeriod; amount: number }[];
}) {
  const fixedTotal = input.fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
  const budgetTotal = input.budget.reduce((s, b) => s + Number(b.amount || 0), 0);
  const monthlyAllowanceTotal = input.allowances
    .filter((a) => a.period === "monthly")
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  return fixedTotal + budgetTotal + monthlyAllowanceTotal;
}

export type MonthlyStructure = {
  salary: number;
  fixed: FixedExpense[];
  budget: BudgetCategoryRow[];
  allowances: AllowanceInstance[]; // monthly-period instances only
  topUps: BudgetItem[];
};

// Merges household_settings structure into a period's budgets row: names,
// caps, and the set of entries always match settings; paid flags and logged
// items are preserved by id when they already exist, and default empty for
// anything new. Used both to seed a brand-new period (existing = null, so
// top_ups start empty) and, from /settings, to cascade a structural edit
// into the already-running current period (existing != null, so whatever
// top-ups were already carried forward or pulled from savings this period
// are preserved, not wiped by an unrelated rename/cap change).
export function reconcileMonthlyFromSettings(
  settings: HouseholdSettings,
  existing: MonthlyStructure | null
): MonthlyStructure {
  const fixedById = new Map((existing?.fixed ?? []).map((f) => [f.id, f]));
  const fixed = settings.fixed.map((def) => ({
    ...def,
    paid: fixedById.get(def.id)?.paid ?? false,
  }));

  const budgetById = new Map((existing?.budget ?? []).map((b) => [b.id, b]));
  const budget = settings.budget.map((def) => ({
    ...def,
    items: budgetById.get(def.id)?.items ?? [],
  }));

  const allowanceById = new Map((existing?.allowances ?? []).map((a) => [a.id, a]));
  const allowances = settings.allowances
    .filter((a) => a.period === "monthly")
    .map((def) => {
      const found = allowanceById.get(def.id);
      return {
        ...def,
        usageItems: found?.usageItems ?? [],
        cashoutItems: found?.cashoutItems ?? [],
      };
    });

  return {
    salary: existing?.salary ?? settings.salary,
    fixed,
    budget,
    allowances,
    topUps: existing?.topUps ?? [],
  };
}

// DB columns are snake_case (top_ups, salary_date); these types are
// camelCase. Small mapping helpers instead of relying on PostgREST select
// aliasing, to match this codebase's existing style of manually
// constructing typed objects from raw rows.
export function monthlyStructureFromRow(row: {
  salary: number;
  fixed: FixedExpense[];
  budget: BudgetCategoryRow[];
  allowances: AllowanceInstance[];
  top_ups: BudgetItem[];
}): MonthlyStructure {
  return {
    salary: row.salary,
    fixed: row.fixed,
    budget: row.budget,
    allowances: row.allowances,
    topUps: row.top_ups,
  };
}

export function monthlyStructureToRow(m: MonthlyStructure) {
  return { salary: m.salary, fixed: m.fixed, budget: m.budget, allowances: m.allowances, top_ups: m.topUps };
}

export function householdSettingsFromRow(row: {
  salary: number;
  salary_date: number;
  fixed: FixedExpenseDef[];
  budget: BudgetCategoryDef[];
  allowances: AllowanceDef[];
}): HouseholdSettings {
  return {
    salary: row.salary,
    salaryDate: row.salary_date,
    fixed: row.fixed,
    budget: row.budget,
    allowances: row.allowances,
  };
}

export function householdSettingsToRow(s: HouseholdSettings) {
  return { salary: s.salary, salary_date: s.salaryDate, fixed: s.fixed, budget: s.budget, allowances: s.allowances };
}

export function debtFromRow(row: { id: string; name: string; amount: number; date: string; paid_at: string | null }): Debt {
  return { id: row.id, name: row.name, amount: row.amount, date: row.date, paidAt: row.paid_at };
}

// Money owed to someone else — a loan taken, a bill they covered for you.
// Not period-scoped, persists until paid. Taking one acts like a top-up
// (the money is spendable now); marking it paid is a negative top-up
// (repaying it leaves this period's spending money).
export type Debt = {
  id: string;
  name: string;
  amount: number;
  date: string;
  paidAt: string | null;
};
