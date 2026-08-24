import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fmt } from "@/lib/types";

// Replaces ClosePeriodPanel — starting a new month is lightweight and
// user-triggered, with no forced reconciliation. Whatever this month's
// balance is (positive or negative) simply becomes next month's opening
// balance.
export function StartNewMonthPanel({
  balance,
  onConfirm,
}: {
  balance: number;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} className="mt-3 rounded-xl border border-gold/35 px-[15px] py-[15px]">
        <Text className="text-center font-body-medium text-[13.5px] text-gold">Start new month</Text>
      </Pressable>
    );
  }

  const confirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
    setOpen(false);
  };

  return (
    <View className="mt-3 rounded-2xl border border-gold/35 bg-card px-4 py-4">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="font-display text-[17px] text-text">Start new month</Text>
        <Pressable onPress={() => setOpen(false)} hitSlop={8}>
          <Text className="text-[17px] leading-none text-muted2">×</Text>
        </Pressable>
      </View>
      <Text className="mb-3.5 text-[12px] leading-5 text-muted">
        {balance >= 0
          ? `${fmt(balance)} carries forward as next month's opening balance.`
          : `${fmt(balance)} carries forward as a shortfall next month.`}
      </Text>

      <Pressable
        onPress={confirm}
        disabled={busy}
        className="items-center rounded-[11px] bg-gold py-3.5"
        style={{ opacity: busy ? 0.7 : 1 }}
      >
        <Text className="font-body-semibold text-[13.5px] text-on-gold">{busy ? "Starting…" : "Start new month"}</Text>
      </Pressable>
    </View>
  );
}
