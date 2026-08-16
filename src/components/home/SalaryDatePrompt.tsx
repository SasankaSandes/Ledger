import { Pressable, Text, View } from "react-native";

export function SalaryDatePrompt({ onClose }: { onClose: () => void }) {
  return (
    <View className="mt-1.5 flex-row items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.1] px-[15px] py-3.5">
      <Text className="flex-1 text-[13px] leading-5 text-text">
        Your salary should have landed — start the new period?
      </Text>
      <Pressable onPress={onClose} className="rounded-lg bg-gold px-3 py-2">
        <Text className="font-body-semibold text-[12px] text-on-gold">Close</Text>
      </Pressable>
    </View>
  );
}
