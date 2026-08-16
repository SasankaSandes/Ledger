import { Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import { fmt } from "@/lib/types";
import { Ring } from "@/components/ui/Ring";
import { darkTokens, lightTokens } from "@/lib/theme/tokens";

// The hero card: safe-to-spend per day, days-to-salary context, the
// overall spend ring, and the two supporting stats.
export function TodaySummaryCard({
  safePerDay,
  spendableTotal,
  daysToSalary,
  spentPct,
  totalSpent,
  moneyLeft,
}: {
  safePerDay: number;
  spendableTotal: number;
  daysToSalary: number;
  spentPct: number;
  totalSpent: number;
  moneyLeft: number;
}) {
  const { colorScheme } = useColorScheme();
  const tokens = colorScheme === "dark" ? darkTokens : lightTokens;
  const safeNegative = spendableTotal <= 0 && safePerDay === 0;
  const over = spentPct > 1;

  return (
    <View className="rounded-2xl border border-line/10 bg-card px-[18px] pb-[18px] pt-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[11px] font-body-medium uppercase tracking-wider text-muted">
            Safe to spend
          </Text>
          <View className="mt-[7px] flex-row items-baseline gap-[7px]">
            <Text
              className={`font-mono text-[34px] font-semibold tracking-tight ${
                safeNegative ? "text-negative" : "text-gold"
              }`}
            >
              {fmt(safePerDay)}
            </Text>
            <Text className="text-[12px] text-muted">/ day</Text>
          </View>
          <Text className="mt-1.5 font-mono text-[12px] text-muted">
            {fmt(Math.max(0, spendableTotal))} over {daysToSalary} days
          </Text>
        </View>
        <View className="relative">
          <Ring pct={spentPct} color={over ? tokens.negative : tokens.gold} trackColor={tokens.fill} />
          <View className="absolute inset-0 items-center justify-center">
            <Text className="font-mono text-[14px] font-semibold text-text">{Math.round(spentPct * 100)}%</Text>
            <Text className="text-[8.5px] uppercase tracking-wider text-muted">spent</Text>
          </View>
        </View>
      </View>

      <View className="mt-[18px] flex-row gap-2.5 border-t border-line/10 pt-[15px]">
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Spent this period</Text>
          <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(totalSpent)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Left</Text>
          <Text
            className={`mt-1 font-mono text-[16px] font-body-medium ${
              moneyLeft < 0 ? "text-negative" : "text-text"
            }`}
          >
            {fmt(moneyLeft)}
          </Text>
        </View>
      </View>
    </View>
  );
}
