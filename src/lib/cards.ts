import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CARD_COLUMNS,
  TRANSACTION_COLUMNS,
  cardFromRow,
  transactionFromRow,
  type Card,
  type CardBalance,
  type Period,
  type Transaction,
} from "./types";

type Client = SupabaseClient<any, any, any>;

// Active cards by default (what pickers and Home show). includeArchived is
// for screens that render history — Activity still needs an archived card's
// name to label old transactions.
export async function loadCards(
  supabase: Client,
  householdId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<Card[]> {
  let query = supabase.from("cards").select(CARD_COLUMNS).eq("household_id", householdId);
  if (!opts.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(cardFromRow);
}

// Lifetime spent/paid per card (across every period), keyed by card id. Cards
// with no transactions come back as { spent: 0, paid: 0 } — the view left-joins.
export async function loadCardBalances(
  supabase: Client,
  householdId: string
): Promise<Record<string, CardBalance>> {
  const { data, error } = await supabase
    .from("card_balances")
    .select("card_id, spent, paid")
    .eq("household_id", householdId);
  if (error) throw error;
  const balances: Record<string, CardBalance> = {};
  for (const row of data ?? []) {
    balances[row.card_id] = { spent: Number(row.spent), paid: Number(row.paid) };
  }
  return balances;
}

// Logs a bill payment toward a card in the given (open) period. Cash leaves
// — it lowers the month balance — and the card's owed amount drops. No
// category or pot: the DB shape check requires both to be null here.
export async function payCardBill(
  supabase: Client,
  params: { householdId: string; period: Period; card: Card; amount: number; date: string; description?: string }
): Promise<Transaction> {
  const { householdId, period, card, amount, date, description } = params;
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      period_id: period.id,
      card_id: card.id,
      type: "card_payment",
      amount,
      description: description?.trim() || `${card.name} payment`,
      date,
    })
    .select(TRANSACTION_COLUMNS)
    .single();
  if (error) throw error;
  return transactionFromRow(data);
}
