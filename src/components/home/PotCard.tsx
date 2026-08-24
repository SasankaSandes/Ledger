import { Pressable, Text, View } from "react-native";
import { fmt, potSpent, type Pot, type Transaction } from "@/lib/types";

// Read-only budget summary — a pot's linked transactions can come from any
// category (chosen per-transaction in Quick Add, not configured here), so
// there's no single-category "log a spend" affordance on this card anymore.
// Tapping it jumps to Activity, pre-filtered to this pot's full history.
export function PotCard({
  pot,
  transactions,
  onPress,
}: {
  pot: Pot;
  transactions: Transaction[]; // pre-filtered to this pot for the viewed period
  onPress: () => void;
}) {
  const spent = potSpent(pot.id, transactions);
  const cap = pot.spendLimit;
  const over = cap > 0 && spent > cap;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

  return (
    <Pressable onPress={onPress} className="rounded-[13px] border border-line/10 bg-card px-3.5 py-3.5">
      <View className="flex-row items-baseline gap-2">
        <Text className="font-body-medium text-[13.5px] text-text">{pot.name}</Text>
        <View className="flex-1" />
        <Text className={`font-mono text-[12.5px] ${over ? "text-negative" : "text-text"}`}>{fmt(spent)}</Text>
        <Text className="font-mono text-[11px] text-muted2">
          {cap > 0 ? `/ ${cap.toLocaleString()}` : "/ no limit"}
        </Text>
      </View>
      {cap > 0 && (
        <View className="mt-2.5 h-1 overflow-hidden rounded bg-fill">
          <View
            className={`h-1 rounded ${over ? "bg-negative" : "bg-gold"}`}
            style={{ width: `${over ? 100 : pct}%` }}
          />
        </View>
      )}
    </Pressable>
  );
}
