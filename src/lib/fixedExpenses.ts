import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TRANSACTION_COLUMNS,
  todayKey,
  transactionFromRow,
  type FixedExpenseDef,
  type Period,
  type Transaction,
} from "./types";

// Posts a fixed expense's expected transaction for the current period.
// `amount` is optionally overridable at confirm time if the actual bill
// differs from the template — defaults to the template's own amount.
export async function confirmFixedExpense(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  period: Period,
  fixedExpense: FixedExpenseDef,
  amount?: number
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      household_id: fixedExpense.householdId,
      period_id: period.id,
      category_id: fixedExpense.categoryId,
      fixed_expense_id: fixedExpense.id,
      type: "out",
      amount: amount ?? fixedExpense.amount,
      description: fixedExpense.name,
      date: todayKey(),
    })
    .select(TRANSACTION_COLUMNS)
    .single();
  if (error) throw error;
  return transactionFromRow(data);
}

// Un-confirms a fixed expense for a period — deletes the transaction it
// posted, putting it back in the "pending" list.
export async function unconfirmFixedExpense(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  periodId: string,
  fixedExpenseId: string
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("period_id", periodId)
    .eq("fixed_expense_id", fixedExpenseId);
  if (error) throw error;
}
