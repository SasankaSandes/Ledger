import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KEYWORD_MAP_COLUMNS,
  keywordMapEntryFromRow,
  type Category,
  type KeywordMapEntry,
  type Pot,
} from "./types";

// First word of a typed note, lowercased — the unit keyword memory keys on.
// Keeps repeated variations of the same thing ("keells", "keells groceries",
// "keells super") collapsing onto one learned mapping. It's a keyword, not
// necessarily a merchant: "lunch", "petrol" and "salary" work just as well.
// Trade-off: two different things sharing a first word (e.g. "uber eats" vs
// "uber ride") will collide onto the same mapping — accepted for this
// milestone.
export function extractKeyword(desc: string): string {
  return desc.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

// Best-guess category for a typed note, scoped to Cash In or Cash Out
// separately so the two lists never collide: a learned keyword-map hit
// first (only if that category still exists and hasn't been archived — a
// mapping can go dangling once its category is archived from Settings),
// falling back to a case-insensitive substring match against category names
// for a cold start with no memory yet.
export function inferCategory(
  desc: string,
  categories: Category[],
  keywordMap: KeywordMapEntry[],
  type: "in" | "out"
): Category | null {
  const keyword = extractKeyword(desc);
  if (!keyword) return null;

  const learned = keywordMap.find((m) => m.keyword === keyword && m.type === type);
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

// Best-guess pot for a typed Cash Out note. A learned keyword-map hit is
// trusted as-is: if the last entry with this keyword had no pot, "no pot" is
// the suggestion (null) rather than falling through to a guess, and a learned
// pot that has since been archived also yields null. Only a keyword with no
// memory at all falls back to a substring match against pot names, mirroring
// inferCategory's cold start. `pots` is the household's live (unarchived) list.
export function inferPot(desc: string, pots: Pot[], keywordMap: KeywordMapEntry[]): Pot | null {
  const keyword = extractKeyword(desc);
  if (!keyword) return null;

  const learned = keywordMap.find((m) => m.keyword === keyword && m.type === "out");
  if (learned) return learned.potId ? (pots.find((p) => p.id === learned.potId) ?? null) : null;

  const lower = desc.toLowerCase();
  return pots.find((p) => p.name && lower.includes(p.name.toLowerCase())) ?? null;
}

export async function loadKeywordMap(
  supabase: SupabaseClient<any, any, any>,
  householdId: string
): Promise<KeywordMapEntry[]> {
  const { data, error } = await supabase
    .from("keyword_map")
    .select(KEYWORD_MAP_COLUMNS)
    .eq("household_id", householdId);
  if (error) throw error;
  return (data ?? []).map(keywordMapEntryFromRow);
}

// Reinforces (or creates) the keyword -> category + pot mapping for a
// confirmed transaction. Last choice wins for both: a null potId is stored as
// null, so skipping the pot this time makes "no pot" the next suggestion. Cash
// In never carries a pot (the table enforces it). Select-then-write rather than
// a single upsert since hit_count needs to increment relative to its current
// value, which the query builder can't express in one call.
export async function learnMapping(
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
  desc: string,
  categoryId: string,
  potId: string | null,
  type: "in" | "out"
): Promise<void> {
  const keyword = extractKeyword(desc);
  if (!keyword) return;
  const learnedPotId = type === "out" ? potId : null;

  const { data: existing, error: selectError } = await supabase
    .from("keyword_map")
    .select("id, hit_count")
    .eq("household_id", householdId)
    .eq("type", type)
    .eq("keyword", keyword)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    // updated_at is maintained by a DB trigger.
    const { error } = await supabase
      .from("keyword_map")
      .update({ category_id: categoryId, pot_id: learnedPotId, hit_count: existing.hit_count + 1 })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("keyword_map").insert({
      household_id: householdId,
      keyword,
      category_id: categoryId,
      pot_id: learnedPotId,
      type,
      hit_count: 1,
    });
    if (error) throw error;
  }
}
