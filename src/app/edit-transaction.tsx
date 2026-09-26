import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/ui/Screen";
import { Keypad } from "@/components/quickadd/Keypad";
import { AmountDisplay } from "@/components/quickadd/AmountDisplay";
import { QuickCategoryRow } from "@/components/quickadd/QuickCategoryRow";
import { DetailPill } from "@/components/quickadd/DetailPill";
import { ChoiceSheet, DateSheet } from "@/components/quickadd/QuickAddSheets";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { useKeyboard } from "@/lib/useKeyboard";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { loadCards } from "@/lib/cards";
import { parseAmount } from "@/lib/amount";
import { NO_HISTORY, loadHistory, sortByUsage } from "@/lib/history";
import {
  CARD_COLUMNS,
  TRANSACTION_COLUMNS,
  cardFromRow,
  categoryFromRow,
  potFromRow,
  shortDate,
  todayKey,
  transactionFromRow,
  yesterdayKey,
  type Card,
  type Category,
  type Pot,
  type TransactionType,
} from "@/lib/types";

const CATEGORY_COLUMNS = "id, household_id, name, type, archived_at";
const POT_COLUMNS = "id, household_id, name, spend_limit, archived_at";

type PayMode = "cash" | "credit";
type SheetKind = "date" | "pot" | "pay";
type Nudge = "amount" | "category" | "card";

const NONE_POT = "none";
const CASH = "cash";

// Presented as a modal (see src/app/_layout.tsx), opened from a tapped row in
// Activity with ?id=<txnId>. Edits value, category, pot, paid-with (cash or a
// card), date and description — type (Cash In/Out/Card payment) is fixed, and
// period_id never changes, so a back-dated edit only moves the date
// label/sort, not which month the transaction counts in. A card payment has
// no category, pot or pay mode — just amount, card, date and description.
// Every save is one plain update; no note suggestions and no merchant-map
// learning (those are fresh-entry affordances, not correction ones), so
// nothing but a tap changes the category or pot an entry already has.
//
// Laid out like Quick Add (src/app/quick-add.tsx) so the two feel like one
// screen: amount readout → note → category → Date / Pot / Paid-with pills
// (each opening a small sheet) → keypad → one button that says what happens
// next ("Enter an amount", "Pick a category", "Choose a card", "Save changes").
// Categories and pots come most-used first, as in Quick Add. While the note has
// focus the keypad steps aside for the keyboard and the button rides above it;
// tapping the amount brings the keypad back.
export default function EditTransactionScreen() {
  const { householdId } = useHousehold();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);

  const [type, setType] = useState<TransactionType>("out");
  const [amountText, setAmountText] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayKey());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteRef = useRef<TextInput>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const insets = useSafeAreaInsets();
  // Web only: how much of the page's bottom the keyboard covers (see useKeyboard).
  const { inset: keyboardInset } = useKeyboard();

  useEffect(
    () => () => {
      clearTimeout(nudgeTimer.current);
      clearTimeout(blurTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!householdId || !id) return;
    (async () => {
      const [{ data: txnRow }, { data: catData }, { data: potData }, cardList, history] = await Promise.all([
        supabase.from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).single(),
        supabase
          .from("categories")
          .select(CATEGORY_COLUMNS)
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("pots")
          .select(POT_COLUMNS)
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        loadCards(supabase, householdId),
        // Ordering is a convenience — fall back to creation order.
        loadHistory(supabase, householdId).catch(() => NO_HISTORY),
      ]);

      if (!txnRow) {
        setError("Transaction not found.");
        setLoading(false);
        return;
      }
      const txn = transactionFromRow(txnRow);
      let cats = (catData ?? []).map(categoryFromRow);
      let potList = (potData ?? []).map(potFromRow);
      let cardsList = cardList;

      // The transaction's current category/pot/card may have been archived
      // since — pull that one row back in so it stays visible and swappable.
      if (txn.categoryId && !cats.some((c) => c.id === txn.categoryId)) {
        const { data } = await supabase.from("categories").select(CATEGORY_COLUMNS).eq("id", txn.categoryId).single();
        if (data) cats = [...cats, categoryFromRow(data)];
      }
      if (txn.potId && !potList.some((p) => p.id === txn.potId)) {
        const { data } = await supabase.from("pots").select(POT_COLUMNS).eq("id", txn.potId).single();
        if (data) potList = [...potList, potFromRow(data)];
      }

      if (txn.cardId && !cardsList.some((c) => c.id === txn.cardId)) {
        const { data } = await supabase.from("cards").select(CARD_COLUMNS).eq("id", txn.cardId).single();
        if (data) cardsList = [...cardsList, cardFromRow(data)];
      }

      setCategories(sortByUsage(cats, history.categories));
      setPots(sortByUsage(potList, history.pots));
      setCards(cardsList);
      setType(txn.type);
      setAmountText(String(txn.amount));
      setDesc(txn.desc);
      setDate(txn.date);
      setSelectedCategoryId(txn.categoryId);
      setSelectedPotId(txn.potId);
      setSelectedCardId(txn.cardId);
      setPayMode(txn.type === "out" && txn.cardId ? "credit" : "cash");
      setLoading(false);
    })();
  }, [householdId, id]);

  const categoriesForType = categories.filter((c) => c.type === type);
  const selectedCategory = categoriesForType.find((c) => c.id === selectedCategoryId) ?? null;
  const selectedPot = type === "out" ? (pots.find((p) => p.id === selectedPotId) ?? null) : null;
  const amount = parseAmount(amountText);
  const isPayment = type === "card_payment";
  const chargedCard = type === "out" && payMode === "credit" ? (cards.find((c) => c.id === selectedCardId) ?? null) : null;
  const paidCard = isPayment ? (cards.find((c) => c.id === selectedCardId) ?? null) : null;
  // A card payment needs the card it paid; a Cash Out on credit needs the card
  // it was charged to.
  const needsCard = isPayment ? !paidCard : type === "out" && payMode === "credit" && !chargedCard;
  const canSave = amount > 0 && (isPayment || !!selectedCategory) && !needsCard;
  const ctaLabel =
    amount <= 0
      ? "Enter an amount"
      : !isPayment && !selectedCategory
        ? "Pick a category"
        : needsCard
          ? "Choose a card"
          : "Save changes";

  const createCategory = async (name: string) => {
    if (!householdId) return;
    const { data } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name, type })
      .select(CATEGORY_COLUMNS)
      .single();
    if (!data) return;
    const created = categoryFromRow(data);
    setCategories((cur) => [...cur, created]);
    setSelectedCategoryId(created.id);
  };

  const createPot = async (name: string) => {
    if (!householdId) return;
    const { data } = await supabase
      .from("pots")
      .insert({ household_id: householdId, name, spend_limit: 0 })
      .select(POT_COLUMNS)
      .single();
    if (!data) return;
    const created = potFromRow(data);
    setPots((cur) => [...cur, created]);
    setSelectedPotId(created.id);
  };

  const selectPay = (cardOrCash: string) => {
    if (cardOrCash === CASH) {
      setPayMode("cash");
      setSelectedCardId(null);
    } else {
      setPayMode("credit");
      setSelectedCardId(cardOrCash);
    }
  };

  const createCard = async (name: string) => {
    if (!householdId) return;
    const { data } = await supabase.from("cards").insert({ household_id: householdId, name }).select(CARD_COLUMNS).single();
    if (!data) return;
    const created = cardFromRow(data);
    setCards((cur) => [...cur, created]);
    selectPay(created.id);
  };

  // The keypad steps aside while the note has focus. Browsers blur the field on
  // the mouse-down of whatever is tapped next (a chip, the Save button);
  // flipping the layout right then would move that target out from under the
  // tap, so the blur is applied after a beat. Explicit exits (tapping the
  // amount, Done/Enter) leave immediately.
  const onNoteFocus = () => {
    clearTimeout(blurTimer.current);
    setNoteFocused(true);
  };
  const onNoteBlur = () => {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setNoteFocused(false), 250);
  };
  const leaveNote = () => {
    clearTimeout(blurTimer.current);
    noteRef.current?.blur();
    setNoteFocused(false);
  };

  const flash = (kind: Nudge) => {
    setNudge(kind);
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(null), 1400);
  };

  const save = async () => {
    if (!id || !canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      // A card payment is only ever amount + card + date + description; the
      // DB shape check rejects a category or pot on it, so don't send either.
      const changes = isPayment
        ? {
            amount,
            card_id: paidCard?.id,
            description: desc.trim() || `${paidCard?.name} payment`,
            date,
          }
        : {
            amount,
            category_id: selectedCategory?.id,
            pot_id: type === "out" ? selectedPotId : null,
            card_id: chargedCard?.id ?? null,
            description: desc.trim() || selectedCategory?.name,
            date,
          };
      const { error: updateError } = await supabase.from("transactions").update(changes).eq("id", id);
      if (updateError) throw updateError;
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
      setSaving(false);
    }
  };

  // Not disabled when something's missing: pressing it answers "what's missing?"
  // by pointing at the field (or, for a card, opening its sheet).
  const onPressSave = () => {
    if (canSave) return save();
    if (amount <= 0) {
      leaveNote(); // bring the keypad back
      flash("amount");
    } else if (!isPayment && !selectedCategory) flash("category");
    else if (needsCard) {
      flash("card");
      setSheet("pay");
    }
  };

  const openSheet = (kind: SheetKind) => {
    Keyboard.dismiss();
    setSheet(kind);
  };

  const remove = () => {
    if (!id) return;
    confirmAction("Delete this transaction?", "This can't be undone.", "Delete", async () => {
      await supabase.from("transactions").delete().eq("id", id);
      router.back();
    });
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const typeLabel = type === "out" ? "Cash Out" : type === "in" ? "Cash In" : "Card payment";
  const dateLabel = date === todayKey() ? "Today" : date === yesterdayKey() ? "Yesterday" : shortDate(date);
  const payLabel = chargedCard ? chargedCard.name : payMode === "credit" ? "Choose card" : "Cash";
  const cardOptions = cards.map((c) => ({ id: c.id, label: c.name }));

  return (
    <View className="flex-1">
      <Screen scroll={false} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          {/* On the web the keyboard covers the page instead of resizing it, so
              shrink the content by what it covers (less the bottom safe area,
              which the keyboard already hides) to lift the Save button above it. */}
          <View className="flex-1 pb-4 pt-3" style={{ marginBottom: Math.max(0, keyboardInset - insets.bottom) }}>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Where Quick Add has its Cash Out / Cash In toggle, Edit shows what
                  it's editing — the type can't change. */}
              <View className="h-9 flex-row items-center">
                <View className="w-8" />
                <View className="flex-1 flex-row items-center justify-center gap-2">
                  <Text className="font-display text-[18px] text-text">Edit</Text>
                  <View className="rounded-lg bg-fill px-3 py-1.5">
                    <Text className="text-[12.5px] font-body-medium text-text">{typeLabel}</Text>
                  </View>
                </View>
                <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close" className="w-8 items-end">
                  <Text className="text-[20px] leading-none text-muted2">×</Text>
                </Pressable>
              </View>

              {error && <Text className="mt-2 text-[12px] text-negative">{error}</Text>}

              <Pressable
                onPress={leaveNote}
                accessibilityLabel="Amount"
                className={`mt-3 items-center rounded-xl border py-2 ${
                  nudge === "amount" ? "border-negative/70" : "border-transparent"
                }`}
              >
                <AmountDisplay text={amountText} />
                <Text className="mt-0.5 h-[18px] text-[12px] text-muted">
                  {type === "out" ? "Spent" : type === "in" ? "Received" : "Paid to card"}
                </Text>
              </Pressable>

              <View className="mt-2">
                <TextInput
                  ref={noteRef}
                  value={desc}
                  onChangeText={setDesc}
                  onFocus={onNoteFocus}
                  onBlur={onNoteBlur}
                  onSubmitEditing={leaveNote}
                  returnKeyType="done"
                  autoCapitalize="none"
                  placeholder={
                    type === "out"
                      ? "What was it? lunch, keells, uber…"
                      : type === "in"
                        ? "Where from? salary, freelance, gift…"
                        : "card payment"
                  }
                  placeholderTextColor="#5C6070"
                  className="h-[42px] rounded-xl border border-line/10 bg-input px-3 text-[14px] text-text"
                />
              </View>

              {!isPayment && (
                <>
                  <View className="mb-1.5 mt-3.5">
                    <Text className="text-[12px] text-muted">Category</Text>
                  </View>
                  <View
                    className={`-mx-1 rounded-xl border px-1 py-1 ${
                      nudge === "category" ? "border-negative/70" : "border-transparent"
                    }`}
                  >
                    <QuickCategoryRow
                      categories={categoriesForType}
                      selectedId={selectedCategoryId}
                      suggested={false}
                      onSelect={setSelectedCategoryId}
                      onCreate={createCategory}
                    />
                  </View>
                </>
              )}

              <View className="mt-3 flex-row gap-1.5">
                <DetailPill label={dateLabel} active={date !== todayKey()} onPress={() => openSheet("date")} />
                {type === "out" && (
                  <>
                    <DetailPill
                      label={selectedPot?.name ?? "No pot"}
                      active={!!selectedPot}
                      onPress={() => openSheet("pot")}
                    />
                    <DetailPill
                      label={payLabel}
                      active={payMode === "credit"}
                      invalid={nudge === "card"}
                      onPress={() => openSheet("pay")}
                    />
                  </>
                )}
                {isPayment && (
                  <DetailPill
                    label={paidCard?.name ?? "Choose card"}
                    active={!!paidCard}
                    invalid={nudge === "card"}
                    onPress={() => openSheet("pay")}
                  />
                )}
              </View>
            </ScrollView>

            <View className="px-4">
              {!noteFocused && <Keypad value={amountText} onChange={setAmountText} compact />}

              <Pressable
                onPress={onPressSave}
                disabled={saving}
                accessibilityRole="button"
                className={`mt-3 items-center rounded-xl py-3.5 ${canSave ? "bg-gold" : "bg-fill"}`}
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                <Text className={`font-body-semibold text-[13.5px] ${canSave ? "text-on-gold" : "text-muted"}`}>
                  {saving ? "Saving…" : ctaLabel}
                </Text>
              </Pressable>

              <Pressable onPress={remove} hitSlop={8} className="mt-2.5 items-center py-1">
                <Text className="text-[12px] text-negative">Delete transaction</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Screen>

      <DateSheet visible={sheet === "date"} value={date} onChange={setDate} onClose={() => setSheet(null)} />
      <ChoiceSheet
        visible={sheet === "pot"}
        title="Pot"
        // "No pot" is always first; the pots after it are already most-used first.
        options={[{ id: NONE_POT, label: "No pot" }, ...pots.map((p) => ({ id: p.id, label: p.name }))]}
        selectedId={selectedPotId ?? NONE_POT}
        onSelect={(pick) => setSelectedPotId(pick === NONE_POT ? null : pick)}
        onClose={() => setSheet(null)}
        createLabel="+ New pot"
        onCreate={createPot}
      />
      <ChoiceSheet
        visible={sheet === "pay"}
        title={isPayment ? "Card" : "Paid with"}
        options={isPayment ? cardOptions : [{ id: CASH, label: "Cash" }, ...cardOptions]}
        selectedId={isPayment || payMode === "credit" ? (selectedCardId ?? "") : CASH}
        onSelect={selectPay}
        onClose={() => setSheet(null)}
        createLabel="+ New card"
        onCreate={createCard}
      />
    </View>
  );
}
