import type { SupabaseClient } from "@supabase/supabase-js";
import { monthBalance, monthKey, nextMonthKey, periodFromRow, type Period, type Transaction } from "./types";

const PERIODS_SELECT = "id, household_id, month_key, started_at, ended_at, opening_balance";

// Ensures the household's currently open period (ended_at is null) exists
// and returns it. Creates one (opening_balance: 0, month_key = today's
// actual calendar month) only when none exists at all — the very first
// period after onboarding. Periods otherwise only ever advance via
// startNewMonth, never by revisiting this function later.
export async function ensureOpenPeriod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string
): Promise<Period> {
  const { data: existing, error: selectError } = await supabase
    .from("periods")
    .select(PERIODS_SELECT)
    .eq("household_id", householdId)
    .is("ended_at", null)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return periodFromRow(existing);

  const { data: created, error } = await supabase
    .from("periods")
    .insert({ household_id: householdId, month_key: monthKey(new Date()), opening_balance: 0 })
    .select(PERIODS_SELECT)
    .single();
  if (error) throw error;
  return periodFromRow(created);
}

// Closes the household's open period and opens a new one, whenever the user
// chooses to — no forced reconciliation. The new period's month_key is
// simply the month after the current one's (August -> September), advancing
// like a calendar page regardless of what today's actual date is — periods
// are user-paced, not date-paced. opening_balance is the old period's
// closing monthBalance.
export async function startNewMonth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  current: Period,
  transactionsThisPeriod: Transaction[]
): Promise<Period> {
  const closingBalance = monthBalance(current, transactionsThisPeriod);

  const { error: closeError } = await supabase
    .from("periods")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", current.id);
  if (closeError) throw closeError;

  const { data: created, error } = await supabase
    .from("periods")
    .insert({
      household_id: householdId,
      month_key: nextMonthKey(current.monthKey),
      opening_balance: closingBalance,
    })
    .select(PERIODS_SELECT)
    .single();
  if (error) throw error;
  return periodFromRow(created);
}

// All periods for the switcher/browse UI, most recent first.
export async function listMonths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string
): Promise<Period[]> {
  const { data, error } = await supabase
    .from("periods")
    .select(PERIODS_SELECT)
    .eq("household_id", householdId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(periodFromRow);
}

// One specific period, for read-only viewing of a past month.
export async function getPeriod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  periodId: string
): Promise<Period> {
  const { data, error } = await supabase.from("periods").select(PERIODS_SELECT).eq("id", periodId).single();
  if (error) throw error;
  return periodFromRow(data);
}
