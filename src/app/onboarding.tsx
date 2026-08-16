import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AmountInput } from "@/components/ui/AmountInput";
import { AllocationSummary } from "@/components/manage/AllocationSummary";
import { FixedExpenseEditor } from "@/components/manage/FixedExpenseEditor";
import { PotEditor } from "@/components/manage/PotEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { EMPTY_HOUSEHOLD_SETTINGS, householdSettingsToRow, type HouseholdSettings } from "@/lib/types";

const STEPS: { key: "salary" | "fixed" | "pots"; blurb: string }[] = [
  { key: "salary", blurb: "What do you take home each period?" },
  { key: "fixed", blurb: "Rent, loans, subscriptions — anything that costs the same amount every period." },
  {
    key: "pots",
    blurb:
      "Spending pots for things you want to track and cap, like groceries or eating out — optional. Don't know your limits yet? Skip this; Ledger will suggest caps from how you actually spend.",
  },
];

export default function OnboardingScreen() {
  const { householdId, refresh } = useHousehold();
  const [settings, setSettings] = useState<HouseholdSettings>(EMPTY_HOUSEHOLD_SETTINGS);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === STEPS.length - 1;

  const finish = async () => {
    if (!householdId) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("household_settings").upsert(
      { household_id: householdId, ...householdSettingsToRow(settings), onboarded_at: new Date().toISOString() },
      { onConflict: "household_id" }
    );
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    // Flips `onboarded` in HouseholdProvider, which lets the root layout's
    // Stack.Protected guard transition into (tabs) automatically.
    await refresh();
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

          {STEPS[step].key === "salary" && (
            <View className="gap-4">
              <View>
                <Text className="mb-1.5 text-[11.5px] text-muted">Monthly salary</Text>
                <AmountInput
                  value={settings.salary}
                  onChange={(n) => setSettings({ ...settings, salary: n ?? 0 })}
                  className="w-[140px] rounded-lg border border-line/10 bg-input px-2.5 py-2 text-left font-mono text-[18px] text-text"
                />
              </View>
              <View>
                <Text className="mb-1.5 text-[11.5px] text-muted">
                  Salary date — the day of the month a new period starts
                </Text>
                <TextInput
                  value={String(settings.salaryDate)}
                  onChangeText={(t) => {
                    const n = Math.min(31, Math.max(1, Number(t.replace(/[^0-9]/g, "")) || 1));
                    setSettings({ ...settings, salaryDate: n });
                  }}
                  inputMode="numeric"
                  className="w-14 rounded-lg border border-line/10 bg-input px-2 py-[7px] text-center font-mono text-[14px] text-text"
                />
              </View>
            </View>
          )}

          {STEPS[step].key === "fixed" && (
            <FixedExpenseEditor items={settings.fixed} onChange={(fixed) => setSettings({ ...settings, fixed })} />
          )}

          {STEPS[step].key === "pots" && (
            <PotEditor items={settings.pots} onChange={(pots) => setSettings({ ...settings, pots })} />
          )}

          <AllocationSummary settings={settings} />
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
                {saving ? "Setting up…" : "Start my first period"}
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
