import { Pressable, Text, View } from "react-native";

// Single dismissible line, at most one insight shown at a time. The full
// pace/anomaly/salary-day coach is a Roadmap item — this milestone covers
// the two simplest cases: a pot over its cap, or a projected leftover.
export function CoachStrip({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <View className="mt-2.5 flex-row items-start gap-2.5 rounded-xl border border-info/20 bg-info/[0.08] px-3.5 py-3">
      <View className="mt-1.5 h-[5px] w-[5px] rounded-full bg-info" />
      <Text className="flex-1 text-[12.5px] leading-5 text-text2">{text}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Text className="text-[15px] leading-none text-muted2">×</Text>
      </Pressable>
    </View>
  );
}
