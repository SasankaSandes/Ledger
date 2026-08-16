import { Text, View } from "react-native";
import { allocatedTotal, fmt, type HouseholdSettings } from "@/lib/types";

export function AllocationSummary({ settings }: { settings: HouseholdSettings }) {
  const allocated = allocatedTotal(settings);
  const unallocated = settings.salary - allocated;
  const over = unallocated < 0;

  return (
    <View
      className={`flex-row items-center justify-between rounded-[10px] border px-3.5 py-2.5 ${
        over ? "border-negative/30 bg-negative/10" : "border-line/10 bg-gold/[0.08]"
      }`}
    >
      <Text className={`text-[12px] ${over ? "text-negative" : "text-muted"}`}>
        {over ? "Over-allocated" : "Unallocated"}
      </Text>
      <Text className={`font-mono text-[14px] ${over ? "text-negative" : "text-positive"}`}>
        {fmt(Math.abs(unallocated))}
      </Text>
    </View>
  );
}
