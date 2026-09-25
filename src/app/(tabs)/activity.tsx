import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { loadCardBalances, loadCards } from "@/lib/cards";
import {
  TRANSACTION_COLUMNS,
  cardOwed,
  categoryFromRow,
  fmt,
  potFromRow,
  shortDate,
  sumCashIn,
  sumItems,
  transactionFromRow,
  type Card,
  type CardBalance,
  type Category,
  type Pot,
  type Transaction,
} from "@/lib/types";

type TypeFilter = "all" | "in" | "out";
// "Paid with" — cash spend, or anything charged to / paid toward a card.
// Picking one specific card (cardFilter) overrides this.
type PayFilter = "all" | "cash" | "credit";

// Replaces the old Money tab (Savings/Debts/Annual) — those folded into
// plain Cash In/Cash Out categories, and this flat, filterable ledger is
// the generic replacement for the visibility their dedicated screens used
// to give. Category, Pot and Card chips elsewhere in the app can deep link
// here pre-filtered via ?category=<id> / ?pot=<id> / ?card=<id>. The "Cash
// Out" tab covers all spending (cash or card) plus card bill payments; a card
// payment shows in the ledger as its own row.
export default function ActivityScreen() {
  const { householdId, nicknames, memberCount } = useHousehold();
  const { session } = useAuth();
  const myId = session?.user.id;
  const params = useLocalSearchParams<{ category?: string; pot?: string; card?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardBalances, setCardBalances] = useState<Record<string, CardBalance>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [potFilter, setPotFilter] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<Transaction | null>(null);

  useEffect(() => {
    if (typeof params.category === "string") setCategoryFilter(params.category);
    if (typeof params.pot === "string") setPotFilter(params.pot);
    if (typeof params.card === "string") setCardFilter(params.card);
  }, [params.category, params.pot, params.card]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const [{ data: catData }, { data: potData }, { data: txnData }, cardList, balances] = await Promise.all([
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
      // Archived cards too — old transactions still need their card's name.
      loadCards(supabase, householdId, { includeArchived: true }),
      loadCardBalances(supabase, householdId),
    ]);
    setCategories((catData ?? []).map(categoryFromRow));
    setPots((potData ?? []).map(potFromRow));
    setCards(cardList);
    setCardBalances(balances);
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
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const activeCategory = categoryFilter ? (categoryById.get(categoryFilter) ?? null) : null;
  const activePot = potFilter ? (potById.get(potFilter) ?? null) : null;
  const activeCard = cardFilter ? (cardById.get(cardFilter) ?? null) : null;

  const filtered = transactions.filter((t) => {
    if (categoryFilter && t.categoryId !== categoryFilter) return false;
    if (potFilter && t.potId !== potFilter) return false;
    // Cash Out covers spending (cash or card) and card bill payments.
    if (typeFilter === "in" && t.type !== "in") return false;
    if (typeFilter === "out" && t.type === "in") return false;
    if (cardFilter) {
      if (t.cardId !== cardFilter) return false;
    } else if (payFilter === "cash") {
      if (t.type !== "out" || t.cardId) return false;
    } else if (payFilter === "credit") {
      if (!t.cardId) return false;
    }
    return true;
  });
  const cashIn = sumCashIn(filtered);
  // All spending in view, cash or card — what this list has always shown as
  // "out". Bill payments are settlement, not new spending, so they're broken
  // out separately rather than added on top.
  const spent = sumItems(filtered.filter((t) => t.type === "out"));
  const paidToCards = sumItems(filtered.filter((t) => t.type === "card_payment"));

  // Show the "by <who>" tag whenever the household has more than one person.
  // Rows added before attribution existed have a null createdBy and stay
  // unlabelled.
  const showAuthors = memberCount > 1;
  const authorSuffix = (t: Transaction): string => {
    if (!showAuthors || !t.createdBy) return "";
    if (t.createdBy === myId) return " · by me";
    const nick = nicknames[t.createdBy];
    return nick ? ` · by ${nick}` : " · by a member";
  };

  const remove = async (id: string) => {
    const removed = transactions.find((t) => t.id === id);
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions((cur) => cur.filter((t) => t.id !== id));
    // Removing a card charge or payment changes what's owed on that card.
    if (removed?.cardId && householdId) setCardBalances(await loadCardBalances(supabase, householdId));
  };

  const confirmRemove = (transaction: Transaction) => {
    confirmAction("Delete this transaction?", "This can't be undone.", "Delete", () => remove(transaction.id));
  };

  const heading = activePot
    ? activePot.name
    : activeCategory
      ? activeCategory.name
      : activeCard
        ? activeCard.name
        : "Running total";

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

        {cards.length > 0 && (
          <>
            <Text className="mb-1.5 mt-3 text-[10.5px] uppercase tracking-wider text-muted">Paid with</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-1.5 pr-4">
                {(["all", "cash", "credit"] as PayFilter[]).map((f) => {
                  const active = !cardFilter && payFilter === f;
                  return (
                    <Pressable
                      key={f}
                      onPress={() => {
                        setPayFilter(f);
                        setCardFilter(null);
                      }}
                      className={`rounded-full border px-2.5 py-1 ${active ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"}`}
                    >
                      <Text className={`text-[11px] ${active ? "text-gold" : "text-muted"}`}>
                        {f === "all" ? "All" : f === "cash" ? "Cash" : "Credit"}
                      </Text>
                    </Pressable>
                  );
                })}
                {cards.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCardFilter(c.id);
                      setPayFilter("all");
                    }}
                    className={`rounded-full border px-2.5 py-1 ${
                      cardFilter === c.id ? "border-gold/40 bg-gold/[0.1]" : "border-line/15"
                    } ${c.archivedAt ? "opacity-50" : ""}`}
                  >
                    <Text className={`text-[11px] ${cardFilter === c.id ? "text-gold" : "text-muted"}`}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-line/10 bg-card px-4 py-3.5">
          <View>
            <Text className="text-[10.5px] uppercase tracking-wider text-muted">{heading}</Text>
            <Text className="mt-0.5 text-[11px] text-muted2">
              {filtered.length} transactions
              {activeCard ? ` · owed ${fmt(cardOwed(activeCard, cardBalances[activeCard.id]))}` : ""}
            </Text>
          </View>
          <View className="items-end">
            <Text className="font-mono text-[13px] text-positive">+{fmt(cashIn)}</Text>
            <Text className="font-mono text-[13px] text-text">−{fmt(spent)}</Text>
            {paidToCards > 0 && <Text className="font-mono text-[11px] text-muted2">{fmt(paidToCards)} paid to cards</Text>}
          </View>
        </View>

        <View className="mt-4 gap-1.5">
          {filtered.length === 0 && <Text className="text-[12.5px] text-muted2">Nothing here yet.</Text>}
          {filtered.map((t) => {
            const cat = t.categoryId ? categoryById.get(t.categoryId) : null;
            const pot = t.potId ? potById.get(t.potId) : null;
            const card = t.cardId ? cardById.get(t.cardId) : null;
            return (
              <Pressable
                key={t.id}
                onPress={() => setMenuFor(t)}
                className="flex-row items-center gap-2.5 rounded-xl border border-line/10 bg-card px-3.5 py-3"
              >
                <View className="flex-1">
                  <Text className="text-[12.5px] text-text2" numberOfLines={1}>
                    {t.desc}
                  </Text>
                  <Text className="mt-0.5 text-[10.5px] text-muted2">
                    {t.type === "card_payment" ? "Card payment" : (cat?.name ?? "—")}
                    {pot ? ` · ${pot.name}` : ""}
                    {card ? ` · ${card.name}` : ""} · {shortDate(t.date)}
                    {authorSuffix(t)}
                  </Text>
                </View>
                <Text className={`font-mono text-[13px] ${t.type === "in" ? "text-positive" : "text-text"}`}>
                  {t.type === "in" ? "+" : "−"}
                  {t.amount.toLocaleString()}
                </Text>
                <Text className="px-0.5 text-[15px] leading-none text-faint">⋮</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ActionSheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.desc}
        actions={
          menuFor
            ? [
                { label: "Edit", onPress: () => router.push(`/edit-transaction?id=${menuFor.id}`) },
                { label: "Remove", destructive: true, onPress: () => confirmRemove(menuFor) },
              ]
            : []
        }
      />
    </Screen>
  );
}
