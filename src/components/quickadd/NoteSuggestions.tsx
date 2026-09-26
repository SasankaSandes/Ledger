import { Pressable, ScrollView, Text, View } from "react-native";
import type { NoteSuggestion } from "@/lib/history";

// Previous notes that match what's being typed, offered in the free space above
// the Add button (so they sit right over the keyboard, under the thumb). Each row
// shows the category and pot that note was filed under; tapping one fills the
// note and applies both as suggestions. keyboardShouldPersistTaps keeps the
// keyboard up so the tap isn't swallowed by dismissing it.
export function NoteSuggestions({
  items,
  onPick,
}: {
  items: NoteSuggestion[];
  onPick: (item: NoteSuggestion) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View className="flex-1 pt-2.5">
      <Text className="mb-0.5 text-[11px] text-muted">Previous notes</Text>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {items.map((item, i) => (
          <Pressable
            key={`${item.text}-${i}`}
            onPress={() => onPick(item)}
            accessibilityRole="button"
            className="flex-row items-center justify-between gap-3 border-b border-line/10 py-2.5 active:bg-fill/40"
          >
            <Text numberOfLines={1} className="shrink text-[14px] text-text2">
              {item.text}
            </Text>
            <Text numberOfLines={1} className="max-w-[45%] text-[11.5px] text-muted">
              {item.category.name}
              {item.pot ? ` · ${item.pot.name}` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
