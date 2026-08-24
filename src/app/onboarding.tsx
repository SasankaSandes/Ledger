import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { CategoryEditor } from "@/components/manage/CategoryEditor";
import { PotEditor } from "@/components/manage/PotEditor";
import { FixedExpenseEditor } from "@/components/manage/FixedExpenseEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureOpenPeriod } from "@/lib/period";
import type { Category, FixedExpenseDef, Pot } from "@/lib/types";

const STEPS: { key: "categories" | "pots" | "fixed"; blurb: string }[] = [
  {
    key: "categories",
    blurb:
      "Tags for organizing and filtering money — where it comes from (Salary, Freelance) and where it goes (Groceries, Rent). Add as many of each as you like.",
  },
  {
    key: "pots",
    blurb: "Pots are budgets — a name and a spend limit. Assign any Cash Out transaction to one when you log it.",
  },
  {
    key: "fixed",
    blurb: "Rent, loans, subscriptions — anything that costs about the same every month, linked to a category.",
  },
];

// Each step reuses the same Manage editors verbatim — categories, pots, and
// fixed expenses are real rows now, so every add here already writes
// straight to Supabase. finish() just flips onboarded_at and opens the
// first period.
export default function OnboardingScreen() {
  const { householdId, refresh } = useHousehold();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseDef[]>([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === STEPS.length - 1;
  const outCategories = categories.filter((c) => c.type === "out");

  const finish = async () => {
    if (!householdId) return;
    setSaving(true);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from("household_settings")
        .upsert({ household_id: householdId, onboarded_at: new Date().toISOString() }, { onConflict: "household_id" });
      if (upsertError) throw upsertError;
      await ensureOpenPeriod(supabase, householdId);
      // Flips `onboarded` in HouseholdProvider, which lets the root layout's
      // Stack.Protected guard transition into (tabs) automatically.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View className="px-[18px] pb-[60px] pt-7">
        <Text className="mb-1 font-display text-[22px] text-text">Let&rsquo;s set up Ledger</Text>
        <Text className="mb-5 text-[11.5px] text-muted">
          Step {step + 1} of {STEPS.length}
        </Text>

        <View className="mb-[18px] gap-4 rounded-2xl border border-line/10 bg-card px-5 py-[22px]">
          <Text className="text-[12.5px] text-muted">{STEPS[step].blurb}</Text>

          {STEPS[step].key === "categories" && householdId && (
            <CategoryEditor householdId={householdId} items={categories} onChange={setCategories} />
          )}

          {STEPS[step].key === "pots" && householdId && (
            <PotEditor householdId={householdId} items={pots} onChange={setPots} />
          )}

          {STEPS[step].key === "fixed" && householdId && (
            <FixedExpenseEditor
              householdId={householdId}
              outCategories={outCategories}
              items={fixedExpenses}
              onChange={setFixedExpenses}
            />
          )}
        </View>

        {error && <Text className="mb-3 text-[12.5px] text-negative">{error}</Text>}

        <View className="flex-row justify-between gap-3">
          <Pressable
            onPress={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-line/15 px-5 py-2.5"
            style={{ opacity: step === 0 ? 0.4 : 1 }}
          >
            <Text className="font-body-semibold text-[14px] text-muted">Back</Text>
          </Pressable>
          {isLast ? (
            <Pressable
              onPress={finish}
              disabled={saving}
              className="rounded-lg bg-gold px-5 py-2.5"
              style={{ opacity: saving ? 0.7 : 1 }}
            >
              <Text className="font-body-semibold text-[14px] text-on-gold">
                {saving ? "Setting up…" : "Start my first month"}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setStep((s) => s + 1)} className="rounded-lg bg-gold px-5 py-2.5">
              <Text className="font-body-semibold text-[14px] text-on-gold">Next</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}
