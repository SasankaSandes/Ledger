import { Pressable, Text, View } from "react-native";
import type { NoteSuggestion } from "@/lib/history";

// Previous notes that match what's being typed, as a dropdown attached to the
// note field: an absolutely-positioned card just under the input that floats over
// whatever is below it (the category row) instead of pushing it down, so nothing
// jumps as the list grows and shrinks with each keystroke. Each row shows the
// category and pot that note was filed under; tapping one fills the note and
// applies both as suggestions.
//
// Must be rendered inside a wrapper around the input that is `relative` (every RN
// view is) and sits above its later siblings (give it a zIndex), and `top` assumes
// the 42pt input plus a 4pt gap.
const INPUT_HEIGHT = 42;

export function NoteSuggestions({
  items,
  onPick,
}: {
  items: NoteSuggestion[];
  onPick: (item: NoteSuggestion) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View
      accessibilityRole="menu"
      className="absolute left-0 right-0 overflow-hidden rounded-xl border border-line/15 bg-card"
      style={{ top: INPUT_HEIGHT + 4, boxShadow: "0 10px 28px rgba(0,0,0,0.45)", elevation: 8 }}
    >
      {items.map((item, i) => (
        <Pressable
          key={`${item.text}-${i}`}
          onPress={() => onPick(item)}
          accessibilityRole="menuitem"
          className={`flex-row items-center justify-between gap-3 px-3.5 py-3 active:bg-fill ${
            i > 0 ? "border-t border-line/10" : ""
          }`}
        >
          <Text numberOfLines={1} className="shrink text-[14px] text-text">
            {item.text}
          </Text>
          <Text numberOfLines={1} className="max-w-[45%] text-[11.5px] text-muted">
            {item.category.name}
            {item.pot ? ` · ${item.pot.name}` : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
