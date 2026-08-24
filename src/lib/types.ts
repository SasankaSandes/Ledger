// A user-defined organizing/filtering tag for money movement — Cash In or
// Cash Out. Pure tag, no limit: budgeting lives on Pot, a separate entity
// (see below). A category has no structural link to any Pot.
export type Category = {
  id: string;
  householdId: string;
  name: string;
  type: "in" | "out";
  archivedAt: string | null; // soft delete — hidden from pickers, history intact
};

// A budget: a spend limit, independent of any category. A transaction
// optionally carries a potId (see Transaction) to say "this spend also
// counts against this budget" — any category can feed any pot, chosen per
// transaction, not configured as a fixed mapping.
export type Pot = {
  id: string;
  householdId: string;
  name: string;
  spendLimit: number;
  archivedAt: string | null;
};

// A recurring expense template, linked to a Cash Out category (for the
// transaction tag its confirms post). Never linked to a Pot — a fixed
// expense is already accounted for, so it shouldn't also eat into a
// discretionary budget's limit (its posted transactions simply never set
// potId — see confirmFixedExpense). Carries no per-period state itself —
// "pending this month" is computed by checking which active fixed expenses
// have no matching transaction yet in the open period (see
// pendingFixedExpenses below).
export type FixedExpenseDef = {
  id: string;
  householdId: string;
  categoryId: string;
  name: string;
  amount: number;
  active: boolean;
};

// A single logged movement of money, always belonging to one period. amount
// is always positive; type carries the sign. potId is independent of
// categoryId — optional, out-only, chosen per transaction.
export type Transaction = {
  id: string;
  householdId: string;
  periodId: string;
  categoryId: string;
  potId: string | null;
  fixedExpenseId: string | null; // set only when posted via "confirm" on a fixed expense
  type: "in" | "out";
  amount: number;
  desc: string;
  date: string; // ISO YYYY-MM-DD, defaults to today at add time
};

// The container for one user-declared month. Exactly one period per
// household has endedAt === null at a time (DB-enforced via a partial
// unique index). openingBalance is this period's carried-forward starting
// point — the prior period's closing monthBalance. monthKey advances one
// calendar month per "start new month" (August -> September -> ...)
// regardless of today's actual date — periods are user-paced, not
// date-paced, but still read like a normal calendar.
export type Period = {
  id: string;
  householdId: string;
  monthKey: string; // "2026-08"
  startedAt: string;
  endedAt: string | null;
  openingBalance: number;
};

// Shared column list for every `.from("transactions").select(...)` call —
// one place to update if the shape changes, instead of six.
export const TRANSACTION_COLUMNS =
  "id, household_id, period_id, category_id, pot_id, fixed_expense_id, type, amount, description, date";

export function monthKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

// The month right after `key` ("2026-08" -> "2026-09"), rolling the year
// over via Date's normal month overflow.
export function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m, 1));
}

export function shortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayKey() {
  return monthKey() + "-" + String(new Date().getDate()).padStart(2, "0");
}

export function fmt(n: number | undefined) {
  return "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

export function sumItems(items: { amount: number }[]) {
  return items.reduce((s, it) => s + Number(it.amount || 0), 0);
}

export function categorySpent(categoryId: string, transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.categoryId === categoryId));
}

// Total logged against a pot this period — every transaction whose potId
// matches, regardless of which category it was tagged with. Fixed-expense
// transactions never carry a potId, so they're excluded automatically.
export function potSpent(potId: string, transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.potId === potId));
}

export function potRemaining(pot: Pot, transactions: Transaction[]): number {
  return Math.max(0, pot.spendLimit - potSpent(pot.id, transactions));
}

// The hero number: opening balance plus everything logged this period,
// cash in minus cash out.
export function monthBalance(period: Period, transactions: Transaction[]): number {
  const cashIn = sumItems(transactions.filter((t) => t.type === "in"));
  const cashOut = sumItems(transactions.filter((t) => t.type === "out"));
  return period.openingBalance + cashIn - cashOut;
}

// Every active fixed expense that hasn't been confirmed (posted as a
// transaction) yet this period.
export function pendingFixedExpenses(
  fixedExpenses: FixedExpenseDef[],
  transactionsThisPeriod: Transaction[]
): FixedExpenseDef[] {
  const postedIds = new Set(
    transactionsThisPeriod.filter((t) => t.fixedExpenseId).map((t) => t.fixedExpenseId)
  );
  return fixedExpenses.filter((f) => f.active && !postedIds.has(f.id));
}

// DB columns are snake_case; these types are camelCase. Small mapping
// helpers instead of relying on PostgREST select aliasing, matching this
// codebase's existing style of manually constructing typed objects from raw
// rows.
export function categoryFromRow(row: {
  id: string;
  household_id: string;
  name: string;
  type: "in" | "out";
  archived_at: string | null;
}): Category {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    type: row.type,
    archivedAt: row.archived_at,
  };
}

export function potFromRow(row: {
  id: string;
  household_id: string;
  name: string;
  spend_limit: number;
  archived_at: string | null;
}): Pot {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    spendLimit: row.spend_limit,
    archivedAt: row.archived_at,
  };
}

export function fixedExpenseDefFromRow(row: {
  id: string;
  household_id: string;
  category_id: string;
  name: string;
  amount: number;
  active: boolean;
}): FixedExpenseDef {
  return {
    id: row.id,
    householdId: row.household_id,
    categoryId: row.category_id,
    name: row.name,
    amount: row.amount,
    active: row.active,
  };
}

export function transactionFromRow(row: {
  id: string;
  household_id: string;
  period_id: string;
  category_id: string;
  pot_id: string | null;
  fixed_expense_id: string | null;
  type: "in" | "out";
  amount: number;
  description: string; // DB column is "description" — "desc" is a reserved SQL keyword
  date: string;
}): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    periodId: row.period_id,
    categoryId: row.category_id,
    potId: row.pot_id,
    fixedExpenseId: row.fixed_expense_id,
    type: row.type,
    amount: row.amount,
    desc: row.description,
    date: row.date,
  };
}

export function periodFromRow(row: {
  id: string;
  household_id: string;
  month_key: string;
  started_at: string;
  ended_at: string | null;
  opening_balance: number;
}): Period {
  return {
    id: row.id,
    householdId: row.household_id,
    monthKey: row.month_key,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    openingBalance: row.opening_balance,
  };
}

// A learned keyword -> category mapping, reinforced on every confirm (see
// src/lib/merchantRouting.ts). Not validated against the current category
// list here — inferCategory() does that filtering at read time, since a
// category can be archived after a mapping to it was learned.
export type MerchantMapEntry = {
  id: string;
  keyword: string;
  categoryId: string;
  type: "in" | "out";
  hitCount: number;
};

export function merchantMapEntryFromRow(row: {
  id: string;
  keyword: string;
  category_id: string;
  type: "in" | "out";
  hit_count: number;
}): MerchantMapEntry {
  return {
    id: row.id,
    keyword: row.keyword,
    categoryId: row.category_id,
    type: row.type,
    hitCount: row.hit_count,
  };
}
