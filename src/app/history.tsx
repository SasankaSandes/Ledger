import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/ui/Screen";

export default function HistoryScreen() {
  return (
    <Screen scroll={false}>
      <Pressable onPress={() => router.back()} className="px-4 pt-1">
        <Text className="text-[12px] text-muted">‹ Back</Text>
      </Pressable>
      <Text className="mt-2 px-5 font-display text-2xl text-text">History</Text>
      <Text className="mt-2 px-5 text-[13px] leading-5 text-muted">
        Closed periods, line-item correction, and reopening the latest period are coming in a later
        build.
      </Text>
    </Screen>
  );
}
