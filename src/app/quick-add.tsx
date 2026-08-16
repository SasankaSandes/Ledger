import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

// Presented as a modal (see options in the root _layout.tsx). The global
// capture sheet — amount keypad, merchant-memory routing, needs-a-category
// inbox — is a later build; a manual add-row inside each expanded pot on
// Home covers deliberate entry for this milestone.
export default function QuickAddScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <Text className="font-display text-2xl text-text">Quick add</Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
        The one-tap capture sheet is coming in a later build. For now, log a spend from inside a pot
        on Home.
      </Text>
      <Pressable onPress={() => router.back()} className="mt-6 rounded-xl border border-line/20 px-5 py-3">
        <Text className="text-[13px] text-text2">Close</Text>
      </Pressable>
    </View>
  );
}
