import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { DetailPill } from "@/components/quickadd/DetailPill";
import { ChoiceSheet } from "@/components/quickadd/QuickAddSheets";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { useViewedMonth } from "@/lib/month/SelectedMonthProvider";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { loadCardBalances, loadCards } from "@/lib/cards";
import { ensureOpenPeriod, listMonths } from "@/lib/period";
import {
  TRANSACTION_COLUMNS,
  amountText,
  cardOwed,
  categoryFromRow,
  fmt,
  monthKeyToLabel,
  potFromRow,
  shortDate,
  sumCashIn,
  sumItems,
  transactionFromRow,
  type Card,
  type CardBalance,
  type Category,
  type Period,
  type Pot,
  type Transaction,
} from "@/lib/types";

type TypeFilter = "all" | "in" | "out";
// "Paid with" — cash spend, or anything charged to / paid toward a card.
// Picking one specific card (cardFilter) overrides this.
type PayFilter = "all" | "cash" | "credit";
type FilterSheetKind = "category" | "pot" | "pay";

// Every filter sheet leads with the same "All" option, which clears the filter.
const ALL = "all";
const PAY_FILTERS: string[] = [ALL, "cash", "credit"];

// Replaces the old Money tab (Savings/Debts/Annual) — those folded into
// plain Cash In/Cash Out categories, and this flat, filterable ledger is
// the generic replacement for the visibility their dedicated screens used
// to give. Category, Pot and Card chips elsewhere in the app can deep link
// here pre-filtered via ?category=<id> / ?pot=<id> / ?card=<id>. The "Cash
// Out" tab covers all spending (cash or card) plus card bill payments; a card
// payment shows in the ledger as its own row. Everything here — the list and
// its totals — is scoped to the month selected in the ‹ › switcher, which is
// shared with Home (see SelectedMonthProvider).
//
// Under the All / Cash In / Cash Out tabs, the Category, Pot and Paid-with
// filters are one row of dropdown chips (the same DetailPill as Quick Add's);
// each opens a bottom sheet of options and, once set, shows its value in gold.
export default function ActivityScreen() {
  const { householdId, nicknames, memberCount } = useHousehold();
  const { session } = useAuth();
  const myId = session?.user.id;
  const params = useLocalSearchParams<{ category?: string; pot?: string; card?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardBalances, setCardBalances] = useState<Record<string, CardBalance>>({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const { viewedPeriod, canGoOlder, canGoNewer, goOlder, goNewer } = useViewedMonth(periods);
  // Tagged with the period it was fetched for, so a month that's still
  // loading never shows the previous month's rows under its own label.
  const [loaded, setLoaded] = useState<{ periodId: string; items: Transaction[] } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [potFilter, setPotFilter] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<Transaction | null>(null);
  const [filterSheet, setFilterSheet] = useState<FilterSheetKind | null>(null);

  useEffect(() => {
    if (typeof params.category === "string") setCategoryFilter(params.category);
    if (typeof params.pot === "string") setPotFilter(params.pot);
    if (typeof params.card === "string") setCardFilter(params.card);
  }, [params.category, params.pot, params.card]);

  const load = useCallback(async () => {
    if (!householdId) return;
    await ensureOpenPeriod(supabase, householdId);
    const [allPeriods, { data: catData }, { data: potData }, cardList, balances] = await Promise.all([
      listMonths(supabase, householdId),
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
      // Archived cards too — old transactions still need their card's name.
      loadCards(supabase, householdId, { includeArchived: true }),
      loadCardBalances(supabase, householdId),
    ]);
    setPeriods(allPeriods);
    setCategories((catData ?? []).map(categoryFromRow));
    setPots((potData ?? []).map(potFromRow));
    setCards(cardList);
    setCardBalances(balances);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  // A transaction belongs to a month by its period_id, not its date (editing
  // the date never moves it between months), so that's what scopes the list.
  // Refetches whenever the selected month changes — including when Home
  // changes it — and on each focus, below.
  const viewedPeriodId = viewedPeriod?.id ?? null;
  useEffect(() => {
    if (!viewedPeriodId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("period_id", viewedPeriodId)
        .order("date", { ascending: false });
      if (!cancelled) setLoaded({ periodId: viewedPeriodId, items: (data ?? []).map(transactionFromRow) });
    })();
    return () => {
      cancelled = true;
    };
  }, [viewedPeriodId, refreshTick]);

  useFocusEffect(
    useCallback(() => {
      load();
      setRefreshTick((t) => t + 1);
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

  const monthLoading = !!viewedPeriod && loaded?.periodId !== viewedPeriod.id;
  const transactions = !monthLoading && loaded ? loaded.items : [];

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
    setLoaded((cur) => cur && { ...cur, items: cur.items.filter((t) => t.id !== id) });
    // Removing a card charge or payment changes what's owed on that card.
    if (removed?.cardId && householdId) setCardBalances(await loadCardBalances(supabase, householdId));
  };

  const confirmRemove = (transaction: Transaction) => {
    confirmAction("Delete this transaction?", "This can't be undone.", "Delete", () => remove(transaction.id));
  };

  // What the Paid-with chip shows once it's set: one card by name, or the
  // Cash / Credit group. Null means no paid-with filter.
  const payLabel = activeCard
    ? activeCard.name
    : payFilter === "cash"
      ? "Cash"
      : payFilter === "credit"
        ? "Credit"
        : null;

  const pickPay = (id: string) => {
    if (PAY_FILTERS.includes(id)) {
      setPayFilter(id as PayFilter);
      setCardFilter(null);
    } else {
      setCardFilter(id);
      setPayFilter("all");
    }
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
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-[22px] text-text">Activity</Text>
          {viewedPeriod && (
            <MonthSwitcher
              label={monthKeyToLabel(viewedPeriod.monthKey)}
              canGoOlder={canGoOlder}
              canGoNewer={canGoNewer}
              onOlder={goOlder}
              onNewer={goNewer}
            />
          )}
        </View>

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

        <View className="mt-3 flex-row gap-1.5">
          <DetailPill
            label={activeCategory?.name ?? "Category"}
            active={!!activeCategory}
            onPress={() => setFilterSheet("category")}
          />
          {pots.length > 0 && (
            <DetailPill label={activePot?.name ?? "Pot"} active={!!activePot} onPress={() => setFilterSheet("pot")} />
          )}
          {cards.length > 0 && (
            <DetailPill label={payLabel ?? "Paid with"} active={payLabel !== null} onPress={() => setFilterSheet("pay")} />
          )}
        </View>

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-line/10 bg-card px-4 py-3.5">
          <View>
            <Text className="text-[10.5px] uppercase tracking-wider text-muted">{heading}</Text>
            <Text className="mt-0.5 text-[11px] text-muted2">
              {monthLoading ? "Loading…" : `${filtered.length} transactions`}
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
          {filtered.length === 0 && (
            <Text className="text-[12.5px] text-muted2">{monthLoading ? "Loading…" : "Nothing here yet."}</Text>
          )}
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
                  {amountText(t.amount)}
                </Text>
                <Text className="px-0.5 text-[15px] leading-none text-faint">⋮</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ChoiceSheet
        modal
        visible={filterSheet === "category"}
        title="Category"
        options={[
          { id: ALL, label: "All" },
          ...categories.map((c) => ({ id: c.id, label: c.name, dimmed: !!c.archivedAt })),
        ]}
        selectedId={categoryFilter ?? ALL}
        onSelect={(id) => setCategoryFilter(id === ALL ? null : id)}
        onClose={() => setFilterSheet(null)}
      />
      <ChoiceSheet
        modal
        visible={filterSheet === "pot"}
        title="Pot"
        options={[{ id: ALL, label: "All" }, ...pots.map((p) => ({ id: p.id, label: p.name, dimmed: !!p.archivedAt }))]}
        selectedId={potFilter ?? ALL}
        onSelect={(id) => setPotFilter(id === ALL ? null : id)}
        onClose={() => setFilterSheet(null)}
      />
      <ChoiceSheet
        modal
        visible={filterSheet === "pay"}
        title="Paid with"
        options={[
          { id: ALL, label: "All" },
          { id: "cash", label: "Cash" },
          { id: "credit", label: "Credit" },
          ...cards.map((c) => ({ id: c.id, label: c.name, dimmed: !!c.archivedAt })),
        ]}
        selectedId={cardFilter ?? payFilter}
        onSelect={pickPay}
        onClose={() => setFilterSheet(null)}
      />

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
