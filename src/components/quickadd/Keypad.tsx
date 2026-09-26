import { Pressable, Text, View } from "react-native";
import { applyKey } from "@/lib/amount";

// Amount entry with a decimal point key. Controlled by the entry string
// ("", "12", "12.", "12.50") — applyKey (src/lib/amount.ts) owns the rules:
// one decimal point, up to 2 decimals, up to 9 whole digits.
//
// Two layouts. Plain (no `onNote`): the 3-column grid the edit and pay-card
// screens use. With `onNote` (Quick Add): a compact 4-column pad — digits on
// the left with a wide 0, backspace on top of the right column, and a tall
// "Note" key filling the rest of it, so moving from the amount to the note is
// one thumb-tap away from the digits instead of a reach up the screen.
const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function Keypad({
  value,
  onChange,
  onNote,
}: {
  value: string;
  onChange: (next: string) => void;
  onNote?: () => void;
}) {
  const press = (key: string) => onChange(applyKey(value, key));

  if (onNote) {
    return (
      <View className="flex-row gap-1.5">
        <View className="flex-[3] gap-1.5">
          {ROWS.map((row, i) => (
            <View key={i} className="flex-row gap-1.5">
              {row.map((d) => (
                <Key key={d} label={d} onPress={() => press(d)} compact />
              ))}
            </View>
          ))}
          <View className="flex-row gap-1.5">
            <Key label="0" onPress={() => press("0")} compact grow={2} />
            <Key label="." onPress={() => press(".")} compact />
          </View>
        </View>
        <View className="flex-1 gap-1.5">
          <Key label="⌫" onPress={() => press("back")} muted compact grow={0} accessibilityLabel="Delete" />
          <Pressable
            onPress={onNote}
            accessibilityRole="button"
            accessibilityLabel="Add a note"
            className="flex-1 items-center justify-center rounded-xl border border-gold/30 bg-gold/[0.12] active:bg-gold/20"
          >
            <Text className="text-[11px] font-body-medium uppercase tracking-wider text-gold">Note</Text>
            <Text className="text-[22px] leading-[24px] text-gold">›</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {ROWS.map((row, i) => (
        <View key={i} className="flex-row gap-2">
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => press(d)} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        <Key label="." onPress={() => press(".")} />
        <Key label="0" onPress={() => press("0")} />
        <Key label="⌫" onPress={() => press("back")} muted />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  muted,
  compact,
  grow = 1,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
  compact?: boolean;
  grow?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // flex: 0 is a zero basis on react-native-web and would collapse the key.
      style={grow > 0 ? { flex: grow } : undefined}
      className={`items-center justify-center rounded-xl bg-fill active:bg-fill2 ${compact ? "h-[46px]" : "py-4"} ${
        grow > 0 ? "" : "shrink-0"
      }`}
    >
      <Text className={`text-[20px] ${muted ? "text-muted" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
}
