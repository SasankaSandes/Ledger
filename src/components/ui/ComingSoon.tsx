import { Text, View } from "react-native";
import { Screen } from "./Screen";

// Placeholder for M2+ screens that just need to exist and be navigable in
// this milestone — Pots/Money tabs, Household, History. Full builds are
// Roadmap items, not part of Foundation + Home.
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Screen scroll={false}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="font-display text-2xl text-text">{title}</Text>
        <Text className="mt-2 text-center text-[13px] leading-5 text-muted">{blurb}</Text>
      </View>
    </Screen>
  );
}
