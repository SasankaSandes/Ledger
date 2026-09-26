import { Pressable, Text, View } from "react-native";
import { applyKey } from "@/lib/amount";

// Amount entry with a decimal point key. Controlled by the entry string
// ("", "12", "12.", "12.50") — applyKey (src/lib/amount.ts) owns the rules:
// one decimal point, up to 2 decimals, up to 9 whole digits.
//
// `compact` (Quick Add and Edit) trades the roomy 60pt keys for 46pt ones so the
// whole entry screen fits a small phone without scrolling.
const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function Keypad({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const press = (key: string) => onChange(applyKey(value, key));
  const gap = compact ? "gap-1.5" : "gap-2";

  return (
    <View className={gap}>
      {ROWS.map((row, i) => (
        <View key={i} className={`flex-row ${gap}`}>
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => press(d)} compact={compact} />
          ))}
        </View>
      ))}
      <View className={`flex-row ${gap}`}>
        <Key label="." onPress={() => press(".")} compact={compact} />
        <Key label="0" onPress={() => press("0")} compact={compact} />
        <Key label="⌫" onPress={() => press("back")} muted compact={compact} accessibilityLabel="Delete" />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  muted,
  compact,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`flex-1 items-center justify-center rounded-xl bg-fill active:bg-fill2 ${compact ? "h-[46px]" : "py-4"}`}
    >
      <Text className={`text-[20px] ${muted ? "text-muted" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
}
