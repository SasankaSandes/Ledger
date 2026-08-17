import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnualAllowanceDef, AnnualAllowanceInstance } from "./types";

// Ensures an allowance_periods row exists for the current calendar year for
// every annual allowance def, then reads back actual usage/cashout items.
// ignoreDuplicates:true means the upsert only ever creates a missing row —
// it never resets an existing row's accumulated items — so the read-back
// afterward, not the upsert's own return, is what reflects current state.
export async function ensureAnnualAllowanceInstances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  defs: AnnualAllowanceDef[],
  year: number = new Date().getFullYear()
): Promise<AnnualAllowanceInstance[]> {
  if (defs.length === 0) return [];
  const ids = defs.map((d) => d.id);

  const { error: upsertError } = await supabase.from("allowance_periods").upsert(
    ids.map((id) => ({
      household_id: householdId,
      allowance_id: id,
      period_year: year,
      usage_items: [],
      cashout_items: [],
    })),
    { onConflict: "household_id,allowance_id,period_year", ignoreDuplicates: true }
  );
  if (upsertError) throw upsertError;

  const { data: periods, error: selectError } = await supabase
    .from("allowance_periods")
    .select("allowance_id, usage_items, cashout_items")
    .eq("household_id", householdId)
    .eq("period_year", year)
    .in("allowance_id", ids);
  if (selectError) throw selectError;

  const byId = new Map((periods ?? []).map((p) => [p.allowance_id, p]));
  return defs.map((def) => ({
    ...def,
    usageItems: byId.get(def.id)?.usage_items ?? [],
    cashoutItems: byId.get(def.id)?.cashout_items ?? [],
  }));
}
