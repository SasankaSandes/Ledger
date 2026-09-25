import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { StartNewMonthPanel } from "@/components/home/StartNewMonthPanel";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { supabase } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/confirm";
import { ensureOpenPeriod, startNewMonth } from "@/lib/period";
import { getHouseholdMemberCount } from "@/lib/supabase/queries";
import {
  TRANSACTION_COLUMNS,
  monthBalance,
  transactionFromRow,
  type Period,
  type Transaction,
} from "@/lib/types";
import type { ThemePreference } from "@/lib/theme/tokens";

const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const { householdId } = useHousehold();
  const { preference, setPreference } = useTheme();
  const { signOut } = useAuth();
  const [period, setPeriod] = useState<Period | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const openPeriod = await ensureOpenPeriod(supabase, householdId);
    const [{ data }, count] = await Promise.all([
      supabase.from("transactions").select(TRANSACTION_COLUMNS).eq("period_id", openPeriod.id),
      getHouseholdMemberCount(supabase, householdId),
    ]);
    setPeriod(openPeriod);
    setTransactions((data ?? []).map(transactionFromRow));
    setMemberCount(count);
    setLoading(false);
  }, [householdId]);

  const navRows: { label: string; subtitle: string; route: string }[] = [
    { label: "Categories", subtitle: "Cash In / Cash Out tags", route: "/settings/categories" },
    { label: "Pots", subtitle: "Budgets with spend limits", route: "/settings/pots-editor" },
    { label: "Cards", subtitle: "Credit cards and what you owe", route: "/settings/cards" },
    { label: "Fixed expenses", subtitle: "Recurring monthly costs", route: "/settings/fixed-expenses" },
    {
      label: "Household",
      subtitle: !memberCount || memberCount <= 1 ? "Just you" : `${memberCount} members`,
      route: "/settings/household",
    },
  ];

  useEffect(() => {
    load();
  }, [load]);

  const confirmStartNewMonth = async () => {
    if (!householdId || !period) return;
    await startNewMonth(supabase, householdId, period, transactions);
    await load();
  };

  const handleLogOut = () => {
    confirmAction("Log out?", "You'll need to sign back in to continue.", "Log out", () => signOut());
  };

  if (loading || !householdId || !period) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[13px] text-muted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  const balance = monthBalance(period, transactions);

  return (
    <Screen>
      <View className="px-[18px] pb-[60px] pt-7">
        <Text className="mb-5 font-display text-[22px] text-text">Settings</Text>

        <View className="gap-2">
          {navRows.map((row) => (
            <Pressable
              key={row.route}
              onPress={() => router.push(row.route as never)}
              className="flex-row items-center gap-2.5 rounded-2xl border border-line/10 bg-card px-3.5 py-3.5"
            >
              <View className="flex-1">
                <Text className="text-[13px] text-text2">{row.label}</Text>
                <Text className="mt-0.5 text-[11px] text-muted2">{row.subtitle}</Text>
              </View>
              <Text className="text-[13px] text-muted">›</Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-6 rounded-2xl border border-line/10 bg-card px-5 py-[22px]">
          <Text className="mb-2 text-[11px] font-body-semibold uppercase tracking-wider text-muted">
            Preferences
          </Text>
          <View className="flex-row items-center justify-between gap-2.5">
            <View className="flex-1 pr-2">
              <Text className="text-[13px] text-text2">Theme</Text>
              <Text className="mt-0.5 text-[11px] text-muted2">Yours only — other members keep theirs</Text>
            </View>
            <View className="flex-shrink-0 flex-row gap-1 rounded-[9px] bg-input p-1">
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

        <StartNewMonthPanel balance={balance} onConfirm={confirmStartNewMonth} />

        <Pressable
          onPress={handleLogOut}
          className="mt-6 items-center rounded-2xl border border-negative/25 bg-card px-3.5 py-3.5"
        >
          <Text className="text-[13px] font-body-medium text-negative">Log out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
