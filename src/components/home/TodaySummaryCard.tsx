import { Text, View } from "react-native";
import { fmt } from "@/lib/types";

// The hero card: this month's balance (opening balance + cash in − cash
// out), actuals (cash in/out), and planned commitments (pot allocation,
// fixed expenses). Cash out is cash spend plus card bill payments, so it
// always reconciles with the balance; spend charged to credit cards is shown
// separately as "On cards" (this month) and "Owed" (lifetime, all cards) and
// only reaches the balance once a bill payment is logged. No more per-day
// pacing or a spend ring — there's no fixed month-end date to divide by in a
// zero-based, user-controlled month.
export function TodaySummaryCard({
  balance,
  cashIn,
  cashOut,
  potAllocation,
  fixedExpensesTotal,
  cards,
}: {
  balance: number;
  cashIn: number;
  cashOut: number;
  potAllocation: number;
  fixedExpensesTotal: number;
  // Omitted when the household has no cards, so the extra row never appears.
  cards?: { spendThisMonth: number; owed: number };
}) {
  const negative = balance < 0;

  return (
    <View className="rounded-2xl border border-line/10 bg-card px-[18px] pb-[18px] pt-5">
      <Text className="text-[11px] font-body-medium uppercase tracking-wider text-muted">Balance this month</Text>
      <Text
        className={`mt-[7px] font-mono text-[34px] font-semibold tracking-tight ${
          negative ? "text-negative" : "text-gold"
        }`}
      >
        {fmt(balance)}
      </Text>

      <View className="mt-[18px] flex-row gap-2.5 border-t border-line/10 pt-[15px]">
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Cash in</Text>
          <Text className="mt-1 font-mono text-[16px] font-body-medium text-positive">{fmt(cashIn)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Cash out</Text>
          <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(cashOut)}</Text>
        </View>
      </View>

      {cards && (
        <View className="mt-3 flex-row gap-2.5 border-t border-line/10 pt-[15px]">
          <View className="flex-1">
            <Text className="text-[10.5px] uppercase tracking-wider text-muted">On cards</Text>
            <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(cards.spendThisMonth)}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[10.5px] uppercase tracking-wider text-muted">Owed on cards</Text>
            <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(cards.owed)}</Text>
          </View>
        </View>
      )}

      <View className="mt-3 flex-row gap-2.5 border-t border-line/10 pt-[15px]">
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Pot allocation</Text>
          <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(potAllocation)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10.5px] uppercase tracking-wider text-muted">Fixed expenses</Text>
          <Text className="mt-1 font-mono text-[16px] font-body-medium text-text">{fmt(fixedExpensesTotal)}</Text>
        </View>
      </View>
    </View>
  );
}
