import { Pressable, Text, View } from "react-native";
import { fmt, type FixedExpense } from "@/lib/types";

export function FixedExpensesSection({
  fixed,
  onTogglePaid,
}: {
  fixed: FixedExpense[];
  onTogglePaid: (id: string, paid: boolean) => void;
}) {
  const total = fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
  const paidTotal = fixed.filter((f) => f.paid).reduce((s, f) => s + Number(f.amount || 0), 0);

  if (fixed.length === 0) return null;

  return (
    <View className="mt-5">
      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="text-[11px] font-body-semibold uppercase tracking-wider text-muted">
          Fixed expenses
        </Text>
        <Text className="font-mono text-[11px] text-muted2">
          {fmt(paidTotal)} / {fmt(total)}
        </Text>
      </View>
      <View className="rounded-[13px] border border-line/10 bg-card px-3.5">
        {fixed.map((f, i) => (
          <View
            key={f.id}
            className={`flex-row items-center gap-2.5 py-2.5 ${i < fixed.length - 1 ? "border-b border-line/5" : ""}`}
          >
            <Text className="flex-1 text-[13px] text-text2">{f.name}</Text>
            <Text className="font-mono text-[12.5px] text-text">{fmt(f.amount)}</Text>
            <Pressable
              onPress={() => onTogglePaid(f.id, !f.paid)}
              className={`min-w-[74px] items-center rounded-[20px] border px-2 py-1 ${
                f.paid ? "border-positive/40 bg-positive/[0.12]" : "border-line/20"
              }`}
            >
              <Text className={`text-[10px] ${f.paid ? "text-positive" : "text-muted"}`}>
                {f.paid ? "Paid" : "Mark paid"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
