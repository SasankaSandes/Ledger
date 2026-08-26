import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import {
  TRANSACTION_COLUMNS,
  categoryFromRow,
  fmt,
  potFromRow,
  shortDate,
  sumItems,
  transactionFromRow,
  type Category,
  type Pot,
  type Transaction,
} from "@/lib/types";

type TypeFilter = "all" | "in" | "out";

// Replaces the old Money tab (Savings/Debts/Annual) — those folded into
// plain Cash In/Cash Out categories, and this flat, filterable ledger is
// the generic replacement for the visibility their dedicated screens used
// to give. Category and Pot chips elsewhere in the app can deep link here
// pre-filtered via ?category=<id> / ?pot=<id>.
export default function ActivityScreen() {
  const { householdId } = useHousehold();
  const params = useLocalSearchParams<{ category?: string; pot?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [potFilter, setPotFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof params.category === "string") setCategoryFilter(params.category);
    if (typeof params.pot === "string") setPotFilter(params.pot);
  }, [params.category, params.pot]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const [{ data: catData }, { data: potData }, { data: txnData }] = await Promise.all([
      supabase
        .from("categories")
        .select("id, household_id, name, type, archived_at")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("pots")
        .select("id, household_id, name, spend_limit, archived_at")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .limit(300),
    ]);
    setCategories((catData ?? []).map(categoryFromRow));
    setPots((potData ?? []).map(potFromRow));
    setTransactions((txnData ?? []).map(transactionFromRow));
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const potById = new Map(pots.map((p) => [p.id, p]));
  const activeCategory = categoryFilter ? (categoryById.get(categoryFilter) ?? null) : null;
  const activePot = potFilter ? (potById.get(potFilter) ?? null) : null;

  const filtered = transactions.filter((t) => {
    if (categoryFilter && t.categoryId !== categoryFilter) return false;
    if (potFilter && t.potId !== potFilter) return false;
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    return true;
  });
  const cashIn = sumItems(filtered.filter((t) => t.type === "in"));
  const cashOut = sumItems(filtered.filter((t) => t.type === "out"));

  const remove = async (id: string) => {
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions((cur) => cur.filter((t) => t.id !== id));
  };

  const confirmRemove = (transaction: Transaction) => {
    confirmAction("Delete this transaction?", "This can't be undone.", "Delete", () => remove(transaction.id));
  };

  const heading = activePot ? activePot.name : activeCategory ? activeCategory.name : "Running total";

  return (
    <Screen>
      <View className="px-4 pb-10 pt-3">
        <Text className="font-display text-[22px] text-text">Activity</Text>

        <View className="mt-3 flex-row gap-1 rounded-[11px] border border-line/10 bg-card p-1">
          {(["all", "in", "out"] as TypeFilter[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTypeFilter(t)}
              className={`flex-1 items-center rounded-lg py-2.5 ${typeFilter === t ? "bg-fill" : ""}`}
            >
              <Text className={`text-[12.5px] font-body-medium ${typeFilter === t ? "text-text" : "text-muted"}`}>
                {t === "all" ? "All" : t === "in" ? "Cash In" : "Cash Out"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-1.5 mt-3 text-[10.5px] uppercase tracking-wider text-muted">Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-1.5 pr-4">
            <Pressable
              onPress={() => setCategoryFilter(null)}
              className={`rounded-full border px-2.5 py-1 ${!categoryFilter ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"}`}
            >
              <Text className={`text-[11px] ${!categoryFilter ? "text-gold" : "text-muted"}`}>All</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryFilter(c.id)}
                className={`rounded-full border px-2.5 py-1 ${
                  categoryFilter === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                } ${c.archivedAt ? "opacity-50" : ""}`}
              >
                <Text className={`text-[11px] ${categoryFilter === c.id ? "text-gold" : "text-muted"}`}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {pots.length > 0 && (
          <>
            <Text className="mb-1.5 mt-3 text-[10.5px] uppercase tracking-wider text-muted">Pot</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-1.5 pr-4">
                <Pressable
                  onPress={() => setPotFilter(null)}
                  className={`rounded-full border px-2.5 py-1 ${!potFilter ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"}`}
                >
                  <Text className={`text-[11px] ${!potFilter ? "text-gold" : "text-muted"}`}>All</Text>
                </Pressable>
                {pots.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setPotFilter(p.id)}
                    className={`rounded-full border px-2.5 py-1 ${
                      potFilter === p.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                    } ${p.archivedAt ? "opacity-50" : ""}`}
                  >
                    <Text className={`text-[11px] ${potFilter === p.id ? "text-gold" : "text-muted"}`}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-line/10 bg-card px-4 py-3.5">
          <View>
            <Text className="text-[10.5px] uppercase tracking-wider text-muted">{heading}</Text>
            <Text className="mt-0.5 text-[11px] text-muted2">{filtered.length} transactions</Text>
          </View>
          <View className="items-end">
            <Text className="font-mono text-[13px] text-positive">+{fmt(cashIn)}</Text>
            <Text className="font-mono text-[13px] text-text">−{fmt(cashOut)}</Text>
          </View>
        </View>

        <View className="mt-4 gap-1.5">
          {filtered.length === 0 && <Text className="text-[12.5px] text-muted2">Nothing here yet.</Text>}
          {filtered.map((t) => {
            const cat = categoryById.get(t.categoryId);
            const pot = t.potId ? potById.get(t.potId) : null;
            return (
              <View
                key={t.id}
                className="flex-row items-center gap-2.5 rounded-xl border border-line/10 bg-card px-3.5 py-3"
              >
                <Pressable
                  onPress={() => router.push(`/edit-transaction?id=${t.id}`)}
                  className="flex-1 flex-row items-center gap-2.5"
                >
                  <View className="flex-1">
                    <Text className="text-[12.5px] text-text2" numberOfLines={1}>
                      {t.desc}
                    </Text>
                    <Text className="mt-0.5 text-[10.5px] text-muted2">
                      {cat?.name ?? "—"}
                      {pot ? ` · ${pot.name}` : ""} · {shortDate(t.date)}
                    </Text>
                  </View>
                  <Text className={`font-mono text-[13px] ${t.type === "in" ? "text-positive" : "text-text"}`}>
                    {t.type === "in" ? "+" : "−"}
                    {t.amount.toLocaleString()}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmRemove(t)} hitSlop={8}>
                  <Text className="px-0.5 text-[14px] text-faint">×</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
