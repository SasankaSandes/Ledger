import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { SavingsSection } from "@/components/money/SavingsSection";
import { DebtsSection } from "@/components/money/DebtsSection";
import { AnnualSection } from "@/components/money/AnnualSection";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { supabase } from "@/lib/supabase/client";
import { ensureAnnualAllowanceInstances } from "@/lib/annualAllowances";
import { debtFromRow, type AnnualAllowanceInstance, type Debt, type SavingsCollection } from "@/lib/types";

type MoneyTab = "savings" | "debts" | "annual";
const TABS: { key: MoneyTab; label: string }[] = [
  { key: "savings", label: "Savings" },
  { key: "debts", label: "Debts" },
  { key: "annual", label: "Annual" },
];

export default function MoneyScreen() {
  const { householdId, settings } = useHousehold();
  const [tab, setTab] = useState<MoneyTab>("savings");
  const [collections, setCollections] = useState<SavingsCollection[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [annualInstances, setAnnualInstances] = useState<AnnualAllowanceInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const [{ data: collectionsData }, { data: debtsData }, instances] = await Promise.all([
      supabase
        .from("savings_collections")
        .select("id, name, transactions")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      supabase
        .from("debts")
        .select("id, name, amount, date, paid_at, repayments")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true }),
      ensureAnnualAllowanceInstances(supabase, householdId, settings.annualAllowances),
    ]);
    setCollections((collectionsData ?? []) as SavingsCollection[]);
    setDebts((debtsData ?? []).map(debtFromRow));
    setAnnualInstances(instances);
    setLoading(false);
  }, [householdId, settings.annualAllowances]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !householdId) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="px-4 pb-10 pt-3">
        <Text className="font-display text-[22px] text-text">Money</Text>

        <View className="mt-4 flex-row gap-1 rounded-[11px] border border-line/10 bg-card p-1">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className={`flex-1 items-center rounded-lg py-2.5 ${tab === t.key ? "bg-fill" : ""}`}
            >
              <Text className={`text-[12.5px] font-body-medium ${tab === t.key ? "text-text" : "text-muted"}`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-4">
          {tab === "savings" && (
            <SavingsSection householdId={householdId} settings={settings} initialCollections={collections} />
          )}
          {tab === "debts" && <DebtsSection householdId={householdId} settings={settings} initialDebts={debts} />}
          {tab === "annual" && <AnnualSection householdId={householdId} initialInstances={annualInstances} />}
        </View>
      </View>
    </Screen>
  );
}
