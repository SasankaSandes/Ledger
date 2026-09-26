import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Pot } from "./types";

type Client = SupabaseClient<any, any, any>;

// How many of the household's most recent Cash In / Cash Out entries Quick
// Add learns from. A window rather than all-time on purpose: it keeps the
// query cheap and lets everything follow current habits (a category you
// stopped using drifts down, a note you stopped typing stops being offered) —
// and it needs no schema or migration.
const HISTORY_WINDOW = 500;

// A note the household has typed before, with the category and pot it was last
// filed under ("last choice wins", like the keyword map) and how often it
// appears. `type` keeps Cash In and Cash Out notes apart.
export type HistoryNote = {
  text: string;
  type: "in" | "out";
  categoryId: string;
  potId: string | null;
  count: number;
};

export type History = {
  categories: Record<string, number>;
  pots: Record<string, number>;
  notes: HistoryNote[];
};

export const NO_HISTORY: History = { categories: {}, pots: {}, notes: [] };

const noteKey = (text: string, type: "in" | "out") => `${type}|${text.trim().toLowerCase()}`;

// One query feeds both the "most used first" ordering (times each category and
// pot appears) and the note suggestions (distinct typed notes). Counted
// client-side since the query builder can't group; pulls a few small columns
// for at most HISTORY_WINDOW rows. Newest first, so the first time a note is
// seen is its latest category/pot.
//
// Skipped as notes: entries with no note, and entries posted from a fixed
// expense (their description is the fixed expense's name, not something typed).
// A note that is just a category's own name (Quick Add's fallback when the note
// is left empty) is filtered out later, in suggestNotes, where names are known.
export async function loadHistory(supabase: Client, householdId: string): Promise<History> {
  const { data, error } = await supabase
    .from("transactions")
    .select("category_id, pot_id, description, type, fixed_expense_id")
    .eq("household_id", householdId)
    .in("type", ["in", "out"])
    .order("date", { ascending: false })
    .limit(HISTORY_WINDOW);
  if (error) throw error;

  const history: History = { categories: {}, pots: {}, notes: [] };
  const byKey = new Map<string, HistoryNote>();
  for (const row of data ?? []) {
    if (row.category_id) history.categories[row.category_id] = (history.categories[row.category_id] ?? 0) + 1;
    if (row.pot_id) history.pots[row.pot_id] = (history.pots[row.pot_id] ?? 0) + 1;

    const text = (row.description ?? "").trim();
    if (!text || row.fixed_expense_id || !row.category_id) continue;
    const key = noteKey(text, row.type);
    const seen = byKey.get(key);
    if (seen) {
      seen.count += 1;
    } else {
      const note: HistoryNote = { text, type: row.type, categoryId: row.category_id, potId: row.pot_id ?? null, count: 1 };
      byKey.set(key, note);
      history.notes.push(note);
    }
  }
  // Most repeated first; ties keep newest-first (Array.sort is stable).
  history.notes.sort((a, b) => b.count - a.count);
  return history;
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

// Folds a just-saved note into the in-memory history so it can be suggested
// straight away, without reloading (Quick Add stays open between entries).
export function recordNote(
  notes: HistoryNote[],
  entry: { text: string; type: "in" | "out"; categoryId: string; potId: string | null }
): HistoryNote[] {
  const key = noteKey(entry.text, entry.type);
  const prior = notes.find((n) => noteKey(n.text, n.type) === key);
  const next: HistoryNote = { ...entry, text: entry.text.trim(), count: (prior?.count ?? 0) + 1 };
  return [next, ...notes.filter((n) => n !== prior)];
}

export type NoteSuggestion = { text: string; category: Category; pot: Pot | null };

// Resolves a history note against the live category/pot lists: its category must
// still exist for this type (not archived), and a pot that no longer exists
// simply becomes "no pot".
function resolve(note: HistoryNote, categories: Category[], pots: Pot[]): NoteSuggestion | null {
  const category = categories.find((c) => c.id === note.categoryId && c.type === note.type);
  if (!category) return null;
  // A note that is just the category's own name is the empty-note fallback, not
  // something the user typed.
  if (note.text.trim().toLowerCase() === category.name.trim().toLowerCase()) return null;
  return { text: note.text, category, pot: note.potId ? (pots.find((p) => p.id === note.potId) ?? null) : null };
}

// The previous note that exactly equals what's typed (case- and edge-space
// insensitive), with the category and pot it was filed under. More precise than
// the first-word keyword map: "uber eats" and "uber ride" resolve separately.
export function findNote(
  text: string,
  notes: HistoryNote[],
  categories: Category[],
  pots: Pot[],
  type: "in" | "out"
): NoteSuggestion | null {
  const key = noteKey(text, type);
  if (key.endsWith("|")) return null;
  const note = notes.find((n) => noteKey(n.text, n.type) === key);
  return note ? resolve(note, categories, pots) : null;
}

// Previous notes worth offering for what's been typed so far: same type, not
// identical to the current text, and either starting with it or having a word
// that does. Prefix matches come first; within each group the most repeated
// note wins. Each carries the category and pot to suggest with it.
export function suggestNotes(
  query: string,
  notes: HistoryNote[],
  categories: Category[],
  pots: Pot[],
  type: "in" | "out",
  limit = 4
): NoteSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const starts: NoteSuggestion[] = [];
  const words: NoteSuggestion[] = [];
  for (const note of notes) {
    if (note.type !== type) continue;
    const lower = note.text.toLowerCase();
    if (lower === q) continue;
    const isPrefix = lower.startsWith(q);
    if (!isPrefix && !lower.split(/\s+/).some((w) => w.startsWith(q))) continue;
    const suggestion = resolve(note, categories, pots);
    if (suggestion) (isPrefix ? starts : words).push(suggestion);
    if (starts.length >= limit) break;
  }
  return [...starts, ...words].slice(0, limit);
}
