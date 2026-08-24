import { Pressable, Text, View } from "react-native";

// Whole-number Rs entry only — no decimal key. Matches fmt()
// (maximumFractionDigits: 0) and every other amount input in the app,
// which strips non-digit characters before parsing.
const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function Keypad({ onDigit, onBackspace }: { onDigit: (d: string) => void; onBackspace: () => void }) {
  return (
    <View className="gap-2">
      {ROWS.map((row, i) => (
        <View key={i} className="flex-row gap-2">
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => onDigit(d)} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        <View className="flex-1" />
        <Key label="0" onPress={() => onDigit("0")} />
        <Key label="⌫" onPress={onBackspace} muted />
      </View>
    </View>
  );
}

function Key({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center rounded-xl bg-fill py-4">
      <Text className={`text-[20px] ${muted ? "text-muted" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
}
