import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Keypad } from "@/components/quickadd/Keypad";
import { AmountDisplay } from "@/components/quickadd/AmountDisplay";
import { QuickCategoryRow } from "@/components/quickadd/QuickCategoryRow";
import { DetailPill } from "@/components/quickadd/DetailPill";
import { ChoiceSheet, DateSheet } from "@/components/quickadd/QuickAddSheets";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import { loadCards } from "@/lib/cards";
import { parseAmount } from "@/lib/amount";
import { inferCategory, inferPot, learnMapping, loadKeywordMap } from "@/lib/keywordRouting";
import { NO_USAGE, loadUsageCounts, sortByUsage } from "@/lib/usage";
import {
  CARD_COLUMNS,
  cardFromRow,
  categoryFromRow,
  fmtExact,
  potFromRow,
  shortDate,
  todayKey,
  yesterdayKey,
  type Card,
  type Category,
  type KeywordMapEntry,
  type Period,
  type Pot,
} from "@/lib/types";

type Mode = "out" | "in";
type PayMode = "cash" | "credit";
type SheetKind = "date" | "pot" | "pay";
type Nudge = "amount" | "category" | "card";

const NONE_POT = "none";
const CASH = "cash";

// Presented as a modal (see src/app/_layout.tsx) from the center tab-bar
// "+" button. Owns its own period/category/pot/card/keyword-map load — a
// separate route from Home, not sharing its in-memory state. Every confirm
// is one plain insert into `transactions`; category is always required,
// pot is an optional, independent choice only offered for Cash Out, and so
// is "paid with" — Cash Out on Credit is charged to a card (owed, not yet
// cash out) and requires picking one. Card bill payments live on Home.
//
// One screen, built around the amount: hero readout → note → category →
// three pills (Date / Pot / Paid with, each opening a small sheet) → keypad →
// an Add button that says what it will add, or what's missing. Typing the
// note suggests a category and (Cash Out) a pot from the household's
// keyword map; suggestions are marked ✦ and yield to anything the user taps.
// The keypad's "Note" key jumps from the amount to the note; while the note
// has focus the keypad steps aside for the keyboard, and tapping the amount
// brings it back.
export default function QuickAddScreen() {
  const { householdId } = useHousehold();
  const [period, setPeriod] = useState<Period | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [keywordMap, setKeywordMap] = useState<KeywordMapEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("out");
  const [amountText, setAmountText] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayKey());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [categorySuggested, setCategorySuggested] = useState(false);
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null);
  const [potManuallySet, setPotManuallySet] = useState(false);
  const [potSuggested, setPotSuggested] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noteRef = useRef<TextInput>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(nudgeTimer.current);
      clearTimeout(toastTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [openPeriod, { data: catData }, { data: potData }, cardList, keywords, usage] = await Promise.all([
        ensureOpenPeriod(supabase, householdId),
        supabase
          .from("categories")
          .select("id, household_id, name, type, archived_at")
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("pots")
          .select("id, household_id, name, spend_limit, archived_at")
          .eq("household_id", householdId)
          .is("archived_at", null)
          .order("created_at", { ascending: true }),
        loadCards(supabase, householdId),
        // Suggestions are a convenience — never let them block adding an entry.
        loadKeywordMap(supabase, householdId).catch((): KeywordMapEntry[] => []),
        // Ordering is a convenience too — fall back to creation order.
        loadUsageCounts(supabase, householdId).catch(() => NO_USAGE),
      ]);
      setPeriod(openPeriod);
      // Ranked once, on open, and left alone while the screen stays open, so
      // chips don't shuffle under the thumb after each Add.
      setCategories(sortByUsage((catData ?? []).map(categoryFromRow), usage.categories));
      setPots(sortByUsage((potData ?? []).map(potFromRow), usage.pots));
      setCards(cardList);
      setKeywordMap(keywords);
      setLoading(false);
    })();
  }, [householdId]);

  const categoriesForMode = categories.filter((c) => c.type === mode);
  const selectedCategory = categoriesForMode.find((c) => c.id === selectedCategoryId) ?? null;
  const selectedPot = mode === "out" ? (pots.find((p) => p.id === selectedPotId) ?? null) : null;

  const guessFor = (text: string, m: Mode) => ({
    category: inferCategory(text, categories, keywordMap, m),
    pot: m === "out" ? inferPot(text, pots, keywordMap) : null,
  });

  // Runs on every keystroke in the note. A suggestion never overrides a value
  // the user chose themselves, and is withdrawn (not left behind) when the
  // note stops matching anything.
  const onChangeDesc = (text: string) => {
    setDesc(text);
    const guess = guessFor(text, mode);
    if (!categoryManuallySet) {
      if (guess.category) {
        setSelectedCategoryId(guess.category.id);
        setCategorySuggested(true);
      } else if (categorySuggested) {
        setSelectedCategoryId(null);
        setCategorySuggested(false);
      }
    }
    if (mode === "out" && !potManuallySet) {
      if (guess.pot) {
        setSelectedPotId(guess.pot.id);
        setPotSuggested(true);
      } else if (potSuggested) {
        setSelectedPotId(null);
        setPotSuggested(false);
      }
    }
  };

  const selectCategory = (id: string) => {
    setSelectedCategoryId(id);
    setCategoryManuallySet(true);
    setCategorySuggested(false);
  };

  const selectPot = (id: string | null) => {
    setSelectedPotId(id);
    setPotManuallySet(true);
    setPotSuggested(false);
  };

  const selectPay = (id: string) => {
    if (id === CASH) {
      setPayMode("cash");
      setSelectedCardId(null);
    } else {
      setPayMode("credit");
      setSelectedCardId(id);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setCategoryManuallySet(false);
    setPotManuallySet(false);
    setPayMode("cash");
    setSelectedCardId(null);
    const guess = guessFor(desc, m);
    setSelectedCategoryId(guess.category?.id ?? null);
    setCategorySuggested(!!guess.category);
    setSelectedPotId(guess.pot?.id ?? null);
    setPotSuggested(!!guess.pot);
  };

  const createCategory = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name, type: mode })
      .select("id, household_id, name, type, archived_at")
      .single();
    if (insertError || !data) return;
    const created = categoryFromRow(data);
    setCategories((cur) => [...cur, created]);
    selectCategory(created.id);
  };

  const createPot = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("pots")
      .insert({ household_id: householdId, name, spend_limit: 0 })
      .select("id, household_id, name, spend_limit, archived_at")
      .single();
    if (insertError || !data) return;
    const created = potFromRow(data);
    setPots((cur) => [...cur, created]);
    selectPot(created.id);
  };

  const createCard = async (name: string) => {
    if (!householdId) return;
    const { data, error: insertError } = await supabase
      .from("cards")
      .insert({ household_id: householdId, name })
      .select(CARD_COLUMNS)
      .single();
    if (insertError || !data) return;
    const created = cardFromRow(data);
    setCards((cur) => [...cur, created]);
    selectPay(created.id);
  };

  const resetForm = () => {
    setAmountText("");
    setDesc("");
    setDate(todayKey());
    setSelectedCategoryId(null);
    setCategoryManuallySet(false);
    setCategorySuggested(false);
    setSelectedPotId(null);
    setPotManuallySet(false);
    setPotSuggested(false);
    setPayMode("cash");
    setSelectedCardId(null);
  };

  const flash = (kind: Nudge) => {
    setNudge(kind);
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(null), 1400);
  };

  const amount = parseAmount(amountText);
  const chargedCard = mode === "out" && payMode === "credit" ? (cards.find((c) => c.id === selectedCardId) ?? null) : null;
  const needsCard = mode === "out" && payMode === "credit" && !chargedCard;
  const ready = amount > 0 && !!selectedCategory && !needsCard;
  const ctaLabel =
    amount <= 0
      ? "Enter an amount"
      : !selectedCategory
        ? "Pick a category"
        : needsCard
          ? "Choose a card"
          : `Add ${fmtExact(amount)} · ${selectedCategory.name}`;

  // Learning is a nice-to-have that happens after the entry is safely saved, so
  // it runs detached and can't turn a successful add into an error (or a
  // duplicate on retry). Every request is awaited inside, so it does fire.
  const learn = async (householdIdArg: string, text: string, categoryId: string, potId: string | null, m: Mode) => {
    try {
      await learnMapping(supabase, householdIdArg, text, categoryId, potId, m);
      setKeywordMap(await loadKeywordMap(supabase, householdIdArg));
    } catch {
      // Suggestions just won't improve this time.
    }
  };

  const confirm = async () => {
    if (!householdId || !period || !selectedCategory || !ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("transactions").insert({
        household_id: householdId,
        period_id: period.id,
        category_id: selectedCategory.id,
        pot_id: selectedPot?.id ?? null,
        card_id: chargedCard?.id ?? null,
        type: mode,
        amount,
        description: desc.trim() || selectedCategory.name,
        date,
      });
      if (insertError) throw insertError;

      if (desc.trim()) void learn(householdId, desc, selectedCategory.id, selectedPot?.id ?? null, mode);

      setJustAdded(`Added to ${selectedCategory.name}${chargedCard ? ` · ${chargedCard.name}` : ""}`);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setJustAdded(null), 1800);
      resetForm();
      noteRef.current?.blur();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // Not disabled when something's missing: pressing it answers "what's missing?"
  // by pointing at the field (or, for a card, opening its sheet).
  const onPressAdd = () => {
    if (ready) return confirm();
    noteRef.current?.blur();
    if (amount <= 0) flash("amount");
    else if (!selectedCategory) flash("category");
    else if (needsCard) {
      flash("card");
      setSheet("pay");
    }
  };

  const openSheet = (kind: SheetKind) => {
    Keyboard.dismiss();
    setSheet(kind);
  };

  if (loading || !period) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const suggestionNote =
    categorySuggested && potSuggested
      ? "Category and pot suggested from note"
      : categorySuggested
        ? "Category suggested from note"
        : potSuggested
          ? "Pot suggested from note"
          : null;

  const dateLabel = date === todayKey() ? "Today" : date === yesterdayKey() ? "Yesterday" : shortDate(date);
  const payLabel = chargedCard ? chargedCard.name : payMode === "credit" ? "Choose card" : "Cash";

  return (
    <View className="flex-1">
      <Screen scroll={false} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View className="flex-1 px-4 pb-4 pt-3">
            <View className="h-9 flex-row items-center">
              <View className="w-8" />
              <View className="flex-1 items-center">
                <View className="flex-row gap-1 rounded-[11px] border border-line/10 bg-card p-1">
                  {(["out", "in"] as Mode[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => switchMode(m)}
                      className={`items-center rounded-lg px-3.5 py-1.5 ${mode === m ? "bg-fill" : ""}`}
                    >
                      <Text className={`text-[12.5px] font-body-medium ${mode === m ? "text-text" : "text-muted"}`}>
                        {m === "out" ? "Cash Out" : "Cash In"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close" className="w-8 items-end">
                <Text className="text-[20px] leading-none text-muted2">×</Text>
              </Pressable>
            </View>

            {error && <Text className="mt-2 text-[12px] text-negative">{error}</Text>}

            <Pressable
              onPress={() => noteRef.current?.blur()}
              accessibilityLabel="Amount"
              className={`mt-3 items-center rounded-xl border py-2 ${
                nudge === "amount" ? "border-negative/70" : "border-transparent"
              }`}
            >
              <AmountDisplay text={amountText} />
              <Text className={`mt-0.5 h-[18px] text-[12px] ${justAdded ? "text-positive" : "text-muted"}`}>
                {justAdded ?? (mode === "out" ? "Spent" : "Received")}
              </Text>
            </Pressable>

            <TextInput
              ref={noteRef}
              value={desc}
              onChangeText={onChangeDesc}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              returnKeyType="done"
              autoCapitalize="none"
              placeholder={mode === "out" ? "What was it? lunch, keells, uber…" : "Where from? salary, freelance, gift…"}
              placeholderTextColor="#5C6070"
              className="mt-2 h-[42px] rounded-xl border border-line/10 bg-input px-3 text-[14px] text-text"
            />

            <View className="mb-1.5 mt-3.5 flex-row items-center justify-between">
              <Text className="text-[12px] text-muted">Category</Text>
              {suggestionNote && <Text className="text-[12px] text-gold">✦ {suggestionNote}</Text>}
            </View>
            <View
              className={`-mx-1 rounded-xl border px-1 py-1 ${
                nudge === "category" ? "border-negative/70" : "border-transparent"
              }`}
            >
              <QuickCategoryRow
                categories={categoriesForMode}
                selectedId={selectedCategoryId}
                suggested={categorySuggested}
                onSelect={selectCategory}
                onCreate={createCategory}
              />
            </View>

            <View className="mt-3 flex-row gap-1.5">
              <DetailPill label={dateLabel} active={date !== todayKey()} onPress={() => openSheet("date")} />
              {mode === "out" && (
                <>
                  <DetailPill
                    label={selectedPot?.name ?? "No pot"}
                    active={!!selectedPot}
                    suggested={potSuggested}
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
            </View>

            <View className="flex-1" />

            {!noteFocused && <Keypad value={amountText} onChange={setAmountText} onNote={() => noteRef.current?.focus()} />}

            <Pressable
              onPress={onPressAdd}
              disabled={saving}
              accessibilityRole="button"
              className={`mt-3 items-center rounded-xl py-3.5 ${ready ? "bg-gold" : "bg-fill"}`}
              style={{ opacity: saving ? 0.7 : 1 }}
            >
              <Text className={`font-body-semibold text-[13.5px] ${ready ? "text-on-gold" : "text-muted"}`}>
                {saving ? "Adding…" : ctaLabel}
              </Text>
            </Pressable>
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
        onSelect={(id) => selectPot(id === NONE_POT ? null : id)}
        onClose={() => setSheet(null)}
        createLabel="+ New pot"
        onCreate={createPot}
      />
      <ChoiceSheet
        visible={sheet === "pay"}
        title="Paid with"
        options={[{ id: CASH, label: "Cash" }, ...cards.map((c) => ({ id: c.id, label: c.name }))]}
        selectedId={payMode === "cash" ? CASH : (selectedCardId ?? "")}
        onSelect={selectPay}
        onClose={() => setSheet(null)}
        createLabel="+ New card"
        onCreate={createCard}
      />
    </View>
  );
}
