import type { SupabaseClient } from "@supabase/supabase-js";
import { merchantMapEntryFromRow, type Category, type MerchantMapEntry } from "./types";

// First word of a typed description, lowercased — the unit merchant memory
// keys on. Keeps repeated variations of the same merchant ("keells",
// "keells groceries", "keells super") collapsing onto one learned mapping.
// Trade-off: two different merchants sharing a first word (e.g. "uber eats"
// vs "uber ride") will collide onto the same mapping — accepted for this
// milestone.
export function extractKeyword(desc: string): string {
  return desc.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

// Best-guess category for a typed description, scoped to Cash In or Cash
// Out separately so the two lists never collide: a learned merchant-map hit
// first (only if that category still exists and hasn't been archived — a
// mapping can go dangling once its category is archived from Settings),
// falling back to a case-insensitive substring match against category names
// for a cold start with no memory yet.
export function inferCategory(
  desc: string,
  categories: Category[],
  merchantMap: MerchantMapEntry[],
  type: "in" | "out"
): Category | null {
  const keyword = extractKeyword(desc);
  if (!keyword) return null;

  const learned = merchantMap.find((m) => m.keyword === keyword && m.type === type);
  if (learned) {
    const category = categories.find((c) => c.id === learned.categoryId && c.type === type && !c.archivedAt);
    if (category) return category;
  }

  const lower = desc.toLowerCase();
  return (
    categories.find((c) => c.type === type && !c.archivedAt && c.name && lower.includes(c.name.toLowerCase())) ??
    null
  );
}

export async function loadMerchantMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string
): Promise<MerchantMapEntry[]> {
  const { data, error } = await supabase
    .from("merchant_map")
    .select("id, keyword, category_id, type, hit_count")
    .eq("household_id", householdId);
  if (error) throw error;
  return (data ?? []).map(merchantMapEntryFromRow);
}

// Reinforces (or creates) the keyword -> category mapping for a confirmed
// transaction. Select-then-write rather than a single upsert since
// hit_count needs to increment relative to its current value, which the
// query builder can't express in one call.
export async function learnMapping(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  desc: string,
  categoryId: string,
  type: "in" | "out"
): Promise<void> {
  const keyword = extractKeyword(desc);
  if (!keyword) return;

  const { data: existing, error: selectError } = await supabase
    .from("merchant_map")
    .select("id, hit_count")
    .eq("household_id", householdId)
    .eq("type", type)
    .eq("keyword", keyword)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("merchant_map")
      .update({ category_id: categoryId, hit_count: existing.hit_count + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("merchant_map")
      .insert({ household_id: householdId, keyword, category_id: categoryId, type, hit_count: 1 });
    if (error) throw error;
  }
}
