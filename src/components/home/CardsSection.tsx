import { Pressable, Text, View } from "react-native";
import { cardOwed, cardSpent, fmt, type Card, type CardBalance, type Transaction } from "@/lib/types";

// One row per active credit card: this month's charges against its monthly
// limit (0 = no limit, same convention as pots), what's owed on it right now
// (lifetime — not scoped to the viewed month), and a Pay shortcut. Tapping the
// row jumps to Activity filtered to that card. Past months are read-only, so
// the Pay button is hidden there.
export function CardsSection({
  cards,
  transactions,
  balances,
  onOpen,
  onPay,
  readOnly,
}: {
  cards: Card[];
  transactions: Transaction[]; // the viewed period's transactions
  balances: Record<string, CardBalance>;
  onOpen: (card: Card) => void;
  onPay: (card: Card) => void;
  readOnly?: boolean;
}) {
  if (cards.length === 0) return null;

  const overCount = cards.filter((c) => c.spendLimit > 0 && cardSpent(c.id, transactions) > c.spendLimit).length;

  return (
    <View className="mt-5">
      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">Cards</Text>
        {overCount > 0 && <Text className="font-mono text-[11px] text-muted2">{overCount} over limit</Text>}
      </View>
      <View className="gap-2">
        {cards.map((card) => {
          const spent = cardSpent(card.id, transactions);
          const owed = cardOwed(card, balances[card.id]);
          const cap = card.spendLimit;
          const over = cap > 0 && spent > cap;
          const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
          return (
            <Pressable
              key={card.id}
              onPress={() => onOpen(card)}
              className="rounded-[13px] border border-line/10 bg-card px-3.5 py-3.5"
            >
              <View className="flex-row items-baseline gap-2">
                <Text className="font-body-medium text-[13.5px] text-text">{card.name}</Text>
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
              <View className="mt-2.5 flex-row items-center justify-between">
                <Text className="text-[11px] text-muted2">
                  Owed <Text className={`font-mono ${owed > 0 ? "text-text" : "text-muted2"}`}>{fmt(owed)}</Text>
                </Text>
                {!readOnly && (
                  <Pressable
                    onPress={() => onPay(card)}
                    hitSlop={6}
                    className="min-w-[74px] items-center rounded-[20px] border border-line/20 px-2 py-1"
                  >
                    <Text className="text-[10px] text-muted">Pay</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
