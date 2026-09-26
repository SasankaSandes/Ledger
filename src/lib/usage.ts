import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<any, any, any>;

// How many of the household's most recent Cash In / Cash Out entries the
// "most used" ranking looks at. A window rather than all-time on purpose: it
// keeps the query cheap and lets the order follow current habits (a category
// you stopped using drifts down) — and it needs no schema or migration.
const USAGE_WINDOW = 500;

export type UsageCounts = {
  categories: Record<string, number>;
  pots: Record<string, number>;
};

export const NO_USAGE: UsageCounts = { categories: {}, pots: {} };

// Times each category and pot appears in the household's recent entries.
// Counted client-side (the query builder can't group), so this pulls two ids
// per row for at most USAGE_WINDOW rows.
export async function loadUsageCounts(supabase: Client, householdId: string): Promise<UsageCounts> {
  const { data, error } = await supabase
    .from("transactions")
    .select("category_id, pot_id")
    .eq("household_id", householdId)
    .in("type", ["in", "out"])
    .order("date", { ascending: false })
    .limit(USAGE_WINDOW);
  if (error) throw error;

  const counts: UsageCounts = { categories: {}, pots: {} };
  for (const row of data ?? []) {
    if (row.category_id) counts.categories[row.category_id] = (counts.categories[row.category_id] ?? 0) + 1;
    if (row.pot_id) counts.pots[row.pot_id] = (counts.pots[row.pot_id] ?? 0) + 1;
  }
  return counts;
}

// Most used first. Ties — including everything never used — keep their
// incoming order (creation order), so a brand-new household sees exactly what
// it saw before.
export function sortByUsage<T extends { id: string }>(items: T[], counts: Record<string, number>): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (counts[b.item.id] ?? 0) - (counts[a.item.id] ?? 0) || a.index - b.index)
    .map(({ item }) => item);
}
