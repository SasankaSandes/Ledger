import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { useHideTabBar } from "@/lib/useHideTabBar";

export default function HouseholdScreen() {
  useHideTabBar();
  return (
    <Screen scroll={false}>
      <View className="flex-1 px-[18px] pt-7">
        <Pressable onPress={() => router.back()} hitSlop={8} className="mb-3 flex-row items-center gap-1">
          <Text className="text-[13px] text-muted">‹ Back</Text>
        </Pressable>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-display text-2xl text-text">Household</Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
            Invites, roles, and member management are coming in a later build.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
