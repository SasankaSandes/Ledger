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

// A credit card. Household-scoped like Pot, with the same soft delete. A Cash
// Out charged to a card (Transaction.cardId) is *owed*, not cash out: it stays
// out of the month balance until a card_payment transaction settles it. What's
// owed on a card is lifetime, not per-period — see cardOwed below.
export type Card = {
  id: string;
  householdId: string;
  name: string;
  spendLimit: number; // monthly cap on this card's spend; 0 = no limit (same convention as Pot)
  openingOwed: number; // already owed before the card was tracked here
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
  cardId: string | null; // default card its confirms are charged to; null = cash
};

// "card_payment" is a credit-card bill payment: cash leaves, and the owed
// amount on transaction.cardId drops. Unlike in/out it has no category or pot.
export type TransactionType = "in" | "out" | "card_payment";

// A single logged movement of money, always belonging to one period. amount
// is always positive; type carries the sign. potId is independent of
// categoryId — optional, out-only, chosen per transaction. cardId means
// "charged to this card" on an out (owed, not yet cash out), or "the card
// being paid" on a card_payment; always null on an in.
export type Transaction = {
  id: string;
  householdId: string;
  periodId: string;
  categoryId: string | null; // null only for card_payment
  potId: string | null;
  cardId: string | null;
  fixedExpenseId: string | null; // set only when posted via "confirm" on a fixed expense
  type: TransactionType;
  amount: number;
  desc: string;
  date: string; // ISO YYYY-MM-DD, defaults to today at add time
  createdBy: string | null; // auth user id of whoever added it; null for rows predating attribution
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

// Shared column lists for every `.select(...)` on these tables — one place to
// update if a shape changes, instead of one per screen.
export const TRANSACTION_COLUMNS =
  "id, household_id, period_id, category_id, pot_id, card_id, fixed_expense_id, type, amount, description, date, created_by";
export const CARD_COLUMNS = "id, household_id, name, spend_limit, opening_owed, archived_at";
export const FIXED_EXPENSE_COLUMNS = "id, household_id, category_id, name, amount, active, card_id";

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

// Local-calendar "YYYY-MM-DD" for an arbitrary Date. Never goes through
// toISOString() — that's UTC and shifts the day for anyone west of GMT near
// midnight, which would silently mis-date transactions.
export function dateToKey(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

// Parse a "YYYY-MM-DD" key back to a Date at local midnight — same idiom
// shortDate() uses above.
export function keyToDate(key: string): Date {
  return new Date(key + "T00:00:00");
}

export function todayKey() {
  return dateToKey(new Date());
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

export function sumCashIn(transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.type === "in"));
}

// Cash that actually left this period: cash spend plus card bill payments.
// Spend charged to a card is deliberately excluded — it's owed, not paid,
// until a card_payment settles it.
export function sumCashOut(transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.type === "card_payment" || (t.type === "out" && !t.cardId)));
}

// Spend charged to any card this period — the "owed, not yet paid" side.
export function sumCardSpend(transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.type === "out" && !!t.cardId));
}

// The hero number: opening balance plus cash in, minus the cash that
// actually left (cash spend + card bill payments).
export function monthBalance(period: Period, transactions: Transaction[]): number {
  return period.openingBalance + sumCashIn(transactions) - sumCashOut(transactions);
}

// Lifetime totals for one card, from the card_balances view: everything ever
// charged to it and everything ever paid toward it, across all periods.
export type CardBalance = { spent: number; paid: number };

// What's owed on a card right now: what it started with, plus every charge,
// minus every payment. Can go negative if overpaid.
export function cardOwed(card: Card, balance: CardBalance | undefined): number {
  return card.openingOwed + (balance?.spent ?? 0) - (balance?.paid ?? 0);
}

// Charged to a card within the given transactions (normally one period) —
// what its monthly spend limit is measured against. Payments don't count.
export function cardSpent(cardId: string, transactions: Transaction[]): number {
  return sumItems(transactions.filter((t) => t.type === "out" && t.cardId === cardId));
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

export function cardFromRow(row: {
  id: string;
  household_id: string;
  name: string;
  spend_limit: number;
  opening_owed: number;
  archived_at: string | null;
}): Card {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    spendLimit: Number(row.spend_limit),
    openingOwed: Number(row.opening_owed),
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
  card_id: string | null;
}): FixedExpenseDef {
  return {
    id: row.id,
    householdId: row.household_id,
    categoryId: row.category_id,
    name: row.name,
    amount: row.amount,
    active: row.active,
    cardId: row.card_id,
  };
}

export function transactionFromRow(row: {
  id: string;
  household_id: string;
  period_id: string;
  category_id: string | null;
  pot_id: string | null;
  card_id: string | null;
  fixed_expense_id: string | null;
  type: TransactionType;
  amount: number;
  description: string; // DB column is "description" — "desc" is a reserved SQL keyword
  date: string;
  created_by: string | null;
}): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    periodId: row.period_id,
    categoryId: row.category_id,
    potId: row.pot_id,
    cardId: row.card_id,
    fixedExpenseId: row.fixed_expense_id,
    type: row.type,
    amount: row.amount,
    desc: row.description,
    date: row.date,
    createdBy: row.created_by,
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
