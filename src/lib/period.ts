import type { SupabaseClient } from "@supabase/supabase-js";
import {
  monthlyStructureFromRow,
  monthlyStructureToRow,
  nextMonthKey,
  periodKey,
  reconcilePeriodFromSettings,
  todayKey,
  uid,
  type BudgetItem,
  type FixedExpense,
  type HouseholdSettings,
  type MonthlyStructure,
  type PotRow,
} from "./types";

const BUDGETS_SELECT = "salary, fixed, pots, top_ups";

function isWellFormedRow(row: unknown): row is {
  salary: number;
  fixed: FixedExpense[];
  pots: PotRow[];
  top_ups: BudgetItem[];
} {
  const r = row as Record<string, unknown> | null;
  return !!r && Array.isArray(r.fixed) && Array.isArray(r.pots) && Array.isArray(r.top_ups);
}

// Ensures the household's currently open period (closed_at is null) exists
// and is well-formed, returning it. Creates one seeded from
// household_settings only when none exists at all (the very first period
// after onboarding) — otherwise periods only ever advance via
// closeOpenPeriod, never by revisiting this function on a later date.
export async function ensureOpenPeriodRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  settings: HouseholdSettings
): Promise<{ month: string; monthly: MonthlyStructure }> {
  const { data: existing } = await supabase
    .from("budgets")
    .select(`month, ${BUDGETS_SELECT}`)
    .eq("household_id", householdId)
    .is("closed_at", null)
    .maybeSingle();

  const existingMonth = (existing as { month?: string } | null)?.month;

  if (existing && isWellFormedRow(existing)) {
    return { month: existingMonth as string, monthly: monthlyStructureFromRow(existing) };
  }

  // No open period at all, or a malformed leftover row — (re)seed it.
  // Upsert on (household_id, month) so a malformed row is repaired in
  // place instead of colliding with the unique constraint.
  const month = existingMonth ?? periodKey(settings.salaryDate);
  const seeded = reconcilePeriodFromSettings(settings, null);
  const { data: created, error } = await supabase
    .from("budgets")
    .upsert(
      { household_id: householdId, month, ...monthlyStructureToRow(seeded), closed_at: null },
      { onConflict: "household_id,month" }
    )
    .select(BUDGETS_SELECT)
    .single();

  if (error) throw error;
  return { month, monthly: monthlyStructureFromRow(created) };
}

// One "bring forward" slice — a pool (or part of a pool, when the user
// splits it across multiple destinations) that lands as a top-up in the
// next period rather than being saved to a collection.
export type ForwardLineItem = { amount: number; desc: string };

// Closes the household's open period and opens the next one, in sequence
// (nextMonthKey), regardless of what today's date is. `forwardItems`
// becomes the new period's opening top-ups, one itemized row per slice —
// splitting a single pool across "bring forward" and "save to a
// collection" can produce several of these landing together. Savings
// deposits for a "save to" choice are the caller's responsibility (the
// Close Period panel writes those directly to savings_collections) — this
// only owns the budgets-row lifecycle.
export async function closeOpenPeriod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  settings: HouseholdSettings,
  current: { month: string },
  forwardItems: ForwardLineItem[]
): Promise<{ month: string; monthly: MonthlyStructure }> {
  const { error: closeError } = await supabase
    .from("budgets")
    .update({ closed_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("month", current.month);
  if (closeError) throw closeError;

  const nextMonth = nextMonthKey(current.month);
  const seeded = reconcilePeriodFromSettings(settings, null);
  const topUps: BudgetItem[] = forwardItems
    .filter((f) => f.amount > 0)
    .map((f) => ({ id: uid(), desc: f.desc, amount: f.amount, date: todayKey() }));

  const { data: created, error } = await supabase
    .from("budgets")
    .upsert(
      {
        household_id: householdId,
        month: nextMonth,
        ...monthlyStructureToRow({ ...seeded, topUps }),
        closed_at: null,
      },
      { onConflict: "household_id,month" }
    )
    .select(BUDGETS_SELECT)
    .single();

  if (error) throw error;
  return { month: nextMonth, monthly: monthlyStructureFromRow(created) };
}
