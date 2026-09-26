import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
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
import { NoteSuggestions } from "@/components/quickadd/NoteSuggestions";
import { ChoiceSheet, DateSheet } from "@/components/quickadd/QuickAddSheets";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { useKeyboard } from "@/lib/useKeyboard";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import { loadCards } from "@/lib/cards";
import { parseAmount } from "@/lib/amount";
import { inferCategory, inferPot, learnMapping, loadKeywordMap } from "@/lib/keywordRouting";
import {
  NO_HISTORY,
  findNote,
  loadHistory,
  recordNote,
  sortByUsage,
  suggestNotes,
  type History,
  type NoteSuggestion,
} from "@/lib/history";
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
// Gap left above the note field when it's scrolled to the top of the screen.
const NOTE_TOP_MARGIN = 6;

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
// one button at the bottom that always says what happens next: "Enter an
// amount", then "Note ›" (jumps to the note), then "Pick a category", then
// "Add Rs … · Category". Typing the note suggests a category and (Cash Out) a
// pot — from the household's keyword map, or exactly from a previous identical
// note — and drops matching previous notes down from the field to tap;
// suggestions are marked ✦ and yield to anything the user taps. While the note
// has focus the keypad steps aside for the keyboard, the upper part of the screen
// scrolls so the note field is at the top, and the button rides above the
// keyboard; tapping the amount brings the keypad back.
export default function QuickAddScreen() {
  const { householdId } = useHousehold();
  const [period, setPeriod] = useState<Period | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [keywordMap, setKeywordMap] = useState<KeywordMapEntry[]>([]);
  const [history, setHistory] = useState<History>(NO_HISTORY);
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
  // Geometry for scrolling the note field to the top while typing: the note
  // wrapper's y inside the scroll content, and the scroll viewport's height.
  const [noteY, setNoteY] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noteRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const insets = useSafeAreaInsets();
  // inset (web only): how much of the page's bottom the keyboard covers.
  // visible: whether a keyboard is up, on any platform.
  const { inset: keyboardInset, visible: keyboardVisible } = useKeyboard();

  // While the note is being typed with the keyboard up, the upper part of the
  // screen scrolls so the note field sits at the very top of what's visible,
  // leaving the room below it for the suggestion dropdown, categories and pills.
  // Scrolling back to the top when typing ends restores the full layout.
  const noteAtTop = noteFocused && keyboardVisible;
  const noteScrollY = Math.max(0, noteY - NOTE_TOP_MARGIN);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: noteAtTop ? noteScrollY : 0, animated: true });
  }, [noteAtTop, noteScrollY, viewportH]);

  useEffect(
    () => () => {
      clearTimeout(nudgeTimer.current);
      clearTimeout(toastTimer.current);
      clearTimeout(blurTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [openPeriod, { data: catData }, { data: potData }, cardList, keywords, loaded] = await Promise.all([
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
        // Ordering and note suggestions are conveniences too — fall back to
        // creation order and no suggestions.
        loadHistory(supabase, householdId).catch(() => NO_HISTORY),
      ]);
      setPeriod(openPeriod);
      // Ranked once, on open, and left alone while the screen stays open, so
      // chips don't shuffle under the thumb after each Add.
      setCategories(sortByUsage((catData ?? []).map(categoryFromRow), loaded.categories));
      setPots(sortByUsage((potData ?? []).map(potFromRow), loaded.pots));
      setCards(cardList);
      setKeywordMap(keywords);
      setHistory(loaded);
      setLoading(false);
    })();
  }, [householdId]);

  const categoriesForMode = categories.filter((c) => c.type === mode);
  const selectedCategory = categoriesForMode.find((c) => c.id === selectedCategoryId) ?? null;
  const selectedPot = mode === "out" ? (pots.find((p) => p.id === selectedPotId) ?? null) : null;

  // What to suggest for a typed note. An exact match with a previous note wins —
  // it knows "uber eats" from "uber ride" — otherwise the first-word keyword map.
  const guessFor = (text: string, m: Mode) => {
    const exact = findNote(text, history.notes, categories, pots, m);
    if (exact) return { category: exact.category, pot: m === "out" ? exact.pot : null };
    return {
      category: inferCategory(text, categories, keywordMap, m),
      pot: m === "out" ? inferPot(text, pots, keywordMap) : null,
    };
  };

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

  // Tapping a previous note is an explicit accept: fill the note and take the
  // category and pot it was filed under, marked ✦ like any note-derived
  // suggestion (they still yield to anything tapped afterwards). The keyboard
  // stays up so Add — which rides above it — is one tap away; browsers blur the
  // field on the tap, so hand focus straight back.
  const pickNote = (s: NoteSuggestion) => {
    noteRef.current?.focus();
    setDesc(s.text);
    setSelectedCategoryId(s.category.id);
    setCategoryManuallySet(false);
    setCategorySuggested(true);
    if (mode === "out") {
      setSelectedPotId(s.pot?.id ?? null);
      setPotManuallySet(false);
      setPotSuggested(!!s.pot);
    }
  };

  // The keypad steps aside while the note has focus. Browsers blur the field on
  // the mouse-down of whatever is tapped next (a chip, the Add button); flipping
  // the layout right then would move that target out from under the tap, so the
  // blur is applied after a beat. Explicit exits (tapping the amount, Done/Enter,
  // saving) leave immediately.
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
  // Amount entered, nothing to say what it was yet, and the note isn't already
  // open: the next step is the note, so the button takes you there.
  const goesToNote = amount > 0 && !selectedCategory && desc.trim() === "" && !noteFocused;
  const ctaLabel =
    amount <= 0
      ? "Enter an amount"
      : goesToNote
        ? "Note ›"
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

      if (desc.trim()) {
        void learn(householdId, desc, selectedCategory.id, selectedPot?.id ?? null, mode);
        // Offer this note straight away too — the screen stays open between entries.
        const entry = { text: desc, type: mode, categoryId: selectedCategory.id, potId: selectedPot?.id ?? null };
        setHistory((h) => ({ ...h, notes: recordNote(h.notes, entry) }));
      }

      setJustAdded(`Added to ${selectedCategory.name}${chargedCard ? ` · ${chargedCard.name}` : ""}`);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setJustAdded(null), 1800);
      resetForm();
      leaveNote();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // Not disabled when something's missing: pressing it answers "what's missing?"
  // by pointing at the field (or, for a card, opening its sheet) — or, when the
  // next step is the note, by taking you there.
  const onPressAdd = () => {
    if (ready) return confirm();
    if (goesToNote) return noteRef.current?.focus();
    if (amount <= 0) {
      leaveNote(); // bring the keypad back
      flash("amount");
    } else if (!selectedCategory) flash("category");
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

  // The dropdown lives only while the note has focus. (`noteFocused` lags a blur
  // by a beat — see onNoteBlur — so tapping a row still lands before it closes.)
  const noteSuggestions = noteFocused ? suggestNotes(desc, history.notes, categories, pots, mode) : [];

  const dateLabel = date === todayKey() ? "Today" : date === yesterdayKey() ? "Yesterday" : shortDate(date);
  const payLabel = chargedCard ? chargedCard.name : payMode === "credit" ? "Choose card" : "Cash";

  return (
    <View className="flex-1">
      <Screen scroll={false} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          {/* On the web the keyboard covers the page instead of resizing it, so
              shrink the content by what it covers (less the bottom safe area,
              which the keyboard already hides) to lift the Add button above it. */}
          <View
            className="flex-1 pb-4 pt-3"
            style={{ marginBottom: Math.max(0, keyboardInset - insets.bottom) }}
          >
            {/* Everything above the keypad scrolls, so that with the keyboard up the
                note field can be brought to the top. minHeight guarantees there's
                enough scroll room to get it there even when the content is short. */}
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
              onContentSizeChange={() => {
                if (noteAtTop) scrollRef.current?.scrollTo({ y: noteScrollY, animated: false });
              }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                minHeight: noteAtTop ? noteScrollY + viewportH : undefined,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
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
                onPress={leaveNote}
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

              {/* The note field and its suggestion dropdown. zIndex lifts the dropdown
                  over the category row that follows; onLayout reports where to
                  scroll to when the note is brought to the top. */}
              <View
                className="mt-2"
                style={{ zIndex: 20 }}
                onLayout={(e) => setNoteY(e.nativeEvent.layout.y)}
              >
                <TextInput
                  ref={noteRef}
                  value={desc}
                  onChangeText={onChangeDesc}
                  onFocus={onNoteFocus}
                  onBlur={onNoteBlur}
                  onSubmitEditing={leaveNote}
                  returnKeyType="done"
                  autoCapitalize="none"
                  placeholder={mode === "out" ? "What was it? lunch, keells, uber…" : "Where from? salary, freelance, gift…"}
                  placeholderTextColor="#5C6070"
                  className="h-[42px] rounded-xl border border-line/10 bg-input px-3 text-[14px] text-text"
                />
                <NoteSuggestions items={noteSuggestions} onPick={pickNote} />
              </View>

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

            </ScrollView>

            <View className="px-4">
              {!noteFocused && <Keypad value={amountText} onChange={setAmountText} compact />}

              <Pressable
                onPress={onPressAdd}
                disabled={saving}
                accessibilityRole="button"
                className={`mt-3 items-center rounded-xl py-3.5 ${ready ? "bg-gold" : "bg-fill"}`}
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                <Text
                  className={`font-body-semibold text-[13.5px] ${
                    ready ? "text-on-gold" : goesToNote ? "text-gold" : "text-muted"
                  }`}
                >
                  {saving ? "Adding…" : ctaLabel}
                </Text>
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
