import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AmountInput } from "@/components/ui/AmountInput";
import { AllocationSummary } from "@/components/manage/AllocationSummary";
import { FixedExpenseEditor } from "@/components/manage/FixedExpenseEditor";
import { PotEditor } from "@/components/manage/PotEditor";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { supabase } from "@/lib/supabase/client";
import {
  householdSettingsToRow,
  monthlyStructureFromRow,
  reconcilePeriodFromSettings,
  type HouseholdSettings,
} from "@/lib/types";
import type { ThemePreference } from "@/lib/theme/tokens";

const DEBOUNCE_MS = 500;
const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export default function ManageScreen() {
  const { householdId, settings: initialSettings } = useHousehold();
  const { preference, setPreference } = useTheme();
  const [settings, setSettings] = useState<HouseholdSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed once household settings arrive from HouseholdProvider (it loads
  // asynchronously after auth resolves).
  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const persist = useCallback(
    async (next: HouseholdSettings) => {
      if (!householdId) return;
      setSaving(true);
      await supabase
        .from("household_settings")
        .update({ ...householdSettingsToRow(next), updated_at: new Date().toISOString() })
        .eq("household_id", householdId);

      // Cascade the structural change into the open period right away —
      // names/caps come from settings, already-logged items are preserved
      // by id (reconcilePeriodFromSettings).
      const { data: current } = await supabase
        .from("budgets")
        .select("month, salary, fixed, pots, top_ups")
        .eq("household_id", householdId)
        .is("closed_at", null)
        .maybeSingle();
      if (current) {
        const reconciled = reconcilePeriodFromSettings(next, monthlyStructureFromRow(current));
        await supabase
          .from("budgets")
          .update({ fixed: reconciled.fixed, pots: reconciled.pots, updated_at: new Date().toISOString() })
          .eq("household_id", householdId)
          .eq("month", current.month);
      }
      setSaving(false);
    },
    [householdId]
  );

  const update = (next: HouseholdSettings) => {
    setSettings(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), DEBOUNCE_MS);
  };

  useEffect(() => {
    const timer = debounceRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <Screen>
      <View className="px-[18px] pb-[60px] pt-7">
        <View className="mb-0.5 flex-row items-baseline justify-between">
          <Text className="font-display text-[22px] text-text">Manage</Text>
          <Text className="text-[11px]" style={{ color: saving ? "#D9A441" : "#5A5F6D" }}>
            {saving ? "saving…" : "saved"}
          </Text>
        </View>

        <View className="mt-5 gap-6 rounded-2xl border border-line/10 bg-card px-5 py-[22px]">
          <View>
            <Text className="mb-2 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
              The plan
            </Text>
            <View className="flex-row items-center gap-2.5">
              <Text className="flex-1 text-[13px] text-text2">Salary</Text>
              <AmountInput
                value={settings.salary}
                onChange={(n) => update({ ...settings, salary: n ?? 0 })}
                className="w-[120px] rounded-lg border border-line/10 bg-input px-2.5 py-2 text-right font-mono text-[13px] text-text"
              />
            </View>
            <View className="mt-2 flex-row items-center gap-2.5">
              <Text className="flex-1 text-[13px] text-text2">Paid on day</Text>
              <TextInput
                value={String(settings.salaryDate)}
                onChangeText={(t) => {
                  const n = Math.min(31, Math.max(1, Number(t.replace(/[^0-9]/g, "")) || 1));
                  update({ ...settings, salaryDate: n });
                }}
                inputMode="numeric"
                className="w-16 rounded-lg border border-line/10 bg-input px-2.5 py-2 text-right font-mono text-[13px] text-text"
              />
            </View>
          </View>

          <View>
            <Text className="mb-2 text-[11px] font-body-semibold uppercase tracking-wider text-muted">Pots</Text>
            <PotEditor items={settings.pots} onChange={(pots) => update({ ...settings, pots })} />
          </View>

          <View>
            <Text className="mb-2 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
              Fixed expenses
            </Text>
            <FixedExpenseEditor items={settings.fixed} onChange={(fixed) => update({ ...settings, fixed })} />
          </View>

          <View>
            <Text className="mb-2 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
              Preferences
            </Text>
            <View className="flex-row items-center justify-between gap-2.5">
              <View>
                <Text className="text-[13px] text-text2">Theme</Text>
                <Text className="mt-0.5 text-[11px] text-muted2">Yours only — other members keep theirs</Text>
              </View>
              <View className="flex-row gap-1 rounded-[9px] bg-input p-1">
                {THEME_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPreference(opt.key)}
                    className={`rounded-md px-2.5 py-1.5 ${preference === opt.key ? "bg-fill" : ""}`}
                  >
                    <Text className={`text-[11.5px] ${preference === opt.key ? "text-text" : "text-muted"}`}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/settings/household")}
            className="flex-row items-center gap-2.5 rounded-2xl border border-line/10 bg-card px-3.5 py-3.5"
          >
            <View className="flex-1">
              <Text className="text-[13px] text-text2">Household</Text>
              <Text className="mt-0.5 text-[11px] text-muted2">Just you</Text>
            </View>
            <Text className="text-[13px] text-muted">›</Text>
          </Pressable>

          <AllocationSummary settings={settings} />
        </View>
      </View>
    </Screen>
  );
}
