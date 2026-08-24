import { Pressable, Text, View } from "react-native";
import { fmt, pendingFixedExpenses, sumItems, type FixedExpenseDef, type Transaction } from "@/lib/types";

export function FixedExpensesSection({
  fixedExpenses,
  transactionsThisPeriod,
  onConfirm,
  onUnconfirm,
  readOnly,
}: {
  fixedExpenses: FixedExpenseDef[];
  transactionsThisPeriod: Transaction[];
  onConfirm: (fe: FixedExpenseDef) => void;
  onUnconfirm: (fe: FixedExpenseDef) => void;
  readOnly?: boolean;
}) {
  if (fixedExpenses.length === 0) return null;

  const pendingIds = new Set(pendingFixedExpenses(fixedExpenses, transactionsThisPeriod).map((f) => f.id));
  const total = sumItems(fixedExpenses);
  const postedTotal = fixedExpenses.filter((f) => !pendingIds.has(f.id)).reduce((s, f) => s + Number(f.amount || 0), 0);

  return (
    <View className="mt-5">
      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">
          Fixed expenses
        </Text>
        <Text className="font-mono text-[11px] text-muted2">
          {fmt(postedTotal)} / {fmt(total)}
        </Text>
      </View>
      <View className="rounded-[13px] border border-line/10 bg-card px-3.5">
        {fixedExpenses.map((f, i) => {
          const isPending = pendingIds.has(f.id);
          return (
            <View
              key={f.id}
              className={`flex-row items-center gap-2.5 py-2.5 ${i < fixedExpenses.length - 1 ? "border-b border-line/5" : ""}`}
            >
              <Text className="flex-1 text-[13px] text-text2">{f.name}</Text>
              <Text className="font-mono text-[12.5px] text-text">{fmt(f.amount)}</Text>
              {readOnly ? (
                <View
                  className={`min-w-[74px] items-center rounded-[20px] border px-2 py-1 ${
                    isPending ? "border-line/20" : "border-positive/40 bg-positive/[0.12]"
                  }`}
                >
                  <Text className={`text-[10px] ${isPending ? "text-muted" : "text-positive"}`}>
                    {isPending ? "Not confirmed" : "Paid"}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => (isPending ? onConfirm(f) : onUnconfirm(f))}
                  className={`min-w-[74px] items-center rounded-[20px] border px-2 py-1 ${
                    isPending ? "border-line/20" : "border-positive/40 bg-positive/[0.12]"
                  }`}
                >
                  <Text className={`text-[10px] ${isPending ? "text-muted" : "text-positive"}`}>
                    {isPending ? "Confirm" : "Paid"}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
